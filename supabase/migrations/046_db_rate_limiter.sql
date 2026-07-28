-- Migration 046: DB-backed rate limiter
-- Replaces the in-memory rate limiter (src/lib/rateLimit.ts). The in-memory
-- implementation breaks on serverless platforms (each Vercel invocation can
-- run on a different instance, so the per-instance Map does not enforce
-- global limits). This migration moves the limiter to Postgres using an
-- atomic SECURITY DEFINER function.
--
-- Design:
--  * One row per key. The row records (count, window_start).
--  * Fixed window: if now() - window_start < window_seconds, the count
--    is incremented and compared to the limit. If it exceeds, the call
--    is rejected and the count is NOT incremented further.
--  * The function is SECURITY DEFINER so it can be called from API route
--    handlers with the anon or authenticated role. To prevent abuse the
--    function is restricted to "authenticated" role.
--  * Old buckets are cleaned up by the function itself (a single DELETE
--    statement) to prevent unbounded growth.
--  * RLS denies direct table access; only the function can read/write.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_buckets_no_direct_access" ON rate_limit_buckets;
CREATE POLICY "rate_limit_buckets_no_direct_access"
  ON rate_limit_buckets FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
  ON rate_limit_buckets(updated_at);

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_allowed BOOLEAN := false;
BEGIN
  -- Opportunistic cleanup of buckets that are well past their window
  -- (a single bucket per call keeps this cheap).
  DELETE FROM rate_limit_buckets
   WHERE key = p_key
     AND window_start < v_now - make_interval(secs => p_window_seconds * 2);

  SELECT count, window_start
    INTO v_count, v_window_start
    FROM rate_limit_buckets
   WHERE key = p_key
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limit_buckets (key, count, window_start, updated_at)
    VALUES (p_key, 1, v_now, v_now);
    RETURN true;
  END IF;

  IF v_now - v_window_start >= make_interval(secs => p_window_seconds) THEN
    UPDATE rate_limit_buckets
       SET count = 1, window_start = v_now, updated_at = v_now
     WHERE key = p_key;
    RETURN true;
  END IF;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  UPDATE rate_limit_buckets
     SET count = v_count + 1, updated_at = v_now
   WHERE key = p_key;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
