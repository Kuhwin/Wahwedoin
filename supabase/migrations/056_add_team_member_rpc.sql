-- Migration 056: add_team_member RPC
--
-- Adds a single, explicit server-side gate for adding a user to a team, to
-- replace the fragile RLS subquery that the team_members INSERT policy relies
-- on. The previous policy checked "the caller is owner or admin of the
-- target team" via a correlated subquery, which surfaced as a generic
-- "new row violates row-level security policy" error to the client and gave
-- no actionable feedback. This function performs the same authorization
-- explicitly and raises a clear, specific message when it fails.
--
-- Mirrors the pattern already used for org membership (delete_org_member,
-- update_org_member_role in migrations 040-041): the function is
-- SECURITY DEFINER, performs an explicit role check, inserts the row, and
-- returns the inserted row. Running as the function owner means the insert
-- is not subject to the caller's RLS WITH CHECK, so authorization is solely
-- this function's explicit check - the previous RLS subquery is bypassed
-- entirely.
--
-- Authorization rules (intentionally identical to the RLS policy it
-- replaces, for compatibility):
--   * The caller may add themselves to the team (matches
--     "user_id = auth.uid()" in the RLS policy).
--   * Otherwise the caller must be owner or admin of the target team
--     (matches the team_members RLS subquery).
--
-- Idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION add_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_role text DEFAULT 'member'
)
RETURNS team_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text;
  inserted team_members;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_team_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'team_id and user_id are required';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Self-add is always allowed (matches the RLS "user_id = auth.uid()"
  -- branch). Otherwise the caller must be owner or admin of the team.
  IF p_user_id <> caller_id THEN
    SELECT role INTO caller_role
      FROM team_members
     WHERE team_id = p_team_id
       AND user_id = caller_id
     LIMIT 1;
    IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Only team owners and admins can add other members to this team';
    END IF;
  END IF;

  -- Friendly error if the user is already on the team, instead of letting
  -- the UNIQUE(team_id, user_id) constraint fail with a generic DB error.
  IF EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = p_team_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'This person is already a member of the team';
  END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (p_team_id, p_user_id, p_role)
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_team_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_team_member(uuid, uuid, text) TO authenticated;
