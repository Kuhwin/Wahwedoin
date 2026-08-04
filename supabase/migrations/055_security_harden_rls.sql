-- Migration 055: Security hardening - enable RLS on any public table missing it
--
-- Background: Supabase's security advisor (lint rls_disabled_in_public) flagged
-- the project on 3 Aug 2026 with a critical issue: a table in the public schema
-- is publicly readable, writable, and deletable because Row Level Security is
-- not enabled. All tables created by our migrations explicitly enable RLS, so
-- the flagged table is one that was created outside the migration set
-- (typically via the Supabase dashboard's Table Editor, which does not enable
-- RLS by default and does not write a migration).
--
-- Fix: enable RLS on every public-schema table that doesn't have it. This
-- resolves the linter alert regardless of which table is flagged and is safe:
--   * Tables the app uses legitimately already have policies, so RLS continues
--     to permit the intended access.
--   * Tables accessed only via the service role key are unaffected because
--     the service role bypasses RLS.
--   * Any table that becomes inaccessible to the anon or authenticated role
--     after this migration was, by definition, the vulnerable table - that
--     is the correct outcome, and a proper policy can be added later.
--
-- This migration is idempotent.

DO $$
DECLARE
  r record;
  fixed_count int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only (no views)
      AND NOT c.relrowsecurity     -- RLS not yet enabled
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tbl);
    RAISE NOTICE 'Hardened: enabled RLS on public.% (had none)', r.tbl;
    fixed_count := fixed_count + 1;
  END LOOP;

  IF fixed_count = 0 THEN
    RAISE NOTICE 'No public tables without RLS found - already hardened.';
  ELSE
    RAISE NOTICE 'Enabled RLS on % public table(s).', fixed_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Guard: prevent demoting the last owner of an organization.
--
-- Pairs with the existing `trg_prevent_remove_last_owner` (migration 037).
-- The role-change RPC update_org_member_role (migration 040) and the org
-- manager UI both rely on this: without it, an owner can be demoted to
-- admin even if they are the last owner, leaving the organization with no
-- owners. This trigger raises an exception if an UPDATE on org_members would
-- leave an organization without any owners.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_demote_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
    IF (SELECT COUNT(*) FROM org_members
          WHERE org_id = OLD.org_id AND role = 'owner' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of the organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_demote_last_owner ON org_members;
CREATE TRIGGER trg_prevent_demote_last_owner
  BEFORE UPDATE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_demote_last_owner();
