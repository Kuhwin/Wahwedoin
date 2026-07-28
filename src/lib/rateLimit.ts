import { getServiceClient } from "@/lib/security";

const FALLBACK_LOCAL_LIMIT = 10_000;
const FALLBACK_LOCAL_WINDOW_MS = 60_000;

interface BucketEntry {
  count: number;
  resetAt: number;
}

const fallbackStore = new Map<string, BucketEntry>();

function pruneExpiredFallback() {
  const now = Date.now();
  for (const [key, entry] of fallbackStore.entries()) {
    if (entry.resetAt <= now) fallbackStore.delete(key);
  }
}

function fallbackRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = fallbackStore.get(key);
  if (!existing || existing.resetAt <= now) {
    fallbackStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/**
 * Consume a rate-limit token. The default implementation calls the
 * `consume_rate_limit` Postgres function (DB-backed, atomic, serverless-safe).
 *
 * If the service client is unavailable (missing env var) or the RPC call fails,
 * the function falls back to a process-local Map. The fallback is a safety
 * net only — in production the service role key should always be set.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    return fallbackRateLimit(key, Math.min(limit, FALLBACK_LOCAL_LIMIT), Math.min(windowMs, FALLBACK_LOCAL_WINDOW_MS));
  }

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      return fallbackRateLimit(key, Math.min(limit, FALLBACK_LOCAL_LIMIT), Math.min(windowMs, FALLBACK_LOCAL_WINDOW_MS));
    }
    return Boolean(data);
  } catch {
    return fallbackRateLimit(key, Math.min(limit, FALLBACK_LOCAL_LIMIT), Math.min(windowMs, FALLBACK_LOCAL_WINDOW_MS));
  }
}

if (typeof setInterval !== "undefined") {
  const interval = setInterval(pruneExpiredFallback, 60_000);
  if (typeof interval.unref === "function") interval.unref();
}
