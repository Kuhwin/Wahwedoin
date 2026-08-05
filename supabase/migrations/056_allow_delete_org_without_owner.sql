-- Migration 056: allow delete_org when the org has no owners
--
-- Background
-- ----------
-- The delete_org function (migration 041) refuses to delete an
-- organization that has no rows in org_members with role = 'owner',
-- raising "Organization has no owner - cannot delete". This is a
-- defensive safeguard, but it blocks legitimate deletion: the real
-- authorization is the first check (caller must be owner or admin of
-- the org), and a caller who is owner/admin of an org should be
-- able to delete it even if the org_members table is missing an
-- owner row (which can happen if the org was created via a flow
-- that failed to insert the owner, or if the owner row was
-- subsequently removed/edited).
--
-- The trigger trg_prevent_remove_last_owner (migration 037) only
-- raises when the row being deleted has role = 'owner' AND it would
-- be the last owner. When the org already has zero owners, the
-- trigger does not fire, so the org_members delete proceeds
-- without issue.
--
-- Fix
-- ---
-- Remove the "no owner" guard so the function performs the deletion
-- as long as the caller passes the owner/admin check. Emit a NOTICE
-- (informational, not an error) when the org has no owners at the
-- time of deletion, for observability. The demotion-to-admin step
-- becomes a no-op when there are no owners and is retained for
-- the normal case.

CREATE OR REPLACE FUNCTION delete_org(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_ids UUID[];
  v_owner_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only org owners and admins can delete an organization';
  END IF;

  -- Informational only: the org currently has no owners. This is
  -- not an error; the caller is already authorized. We still allow
  -- the deletion because the caller (owner/admin) is explicitly
  -- requesting it and the last-owner trigger will not fire when no
  -- row being deleted has role = 'owner'.
  SELECT COUNT(*) INTO v_owner_count
    FROM org_members
   WHERE org_id = p_org_id AND role = 'owner';
  IF v_owner_count = 0 THEN
    RAISE NOTICE 'delete_org: org % has no owners; proceeding with deletion as requested by an owner/admin (%)', p_org_id, auth.uid();
  END IF;

  -- Demote owners to admin so the trigger doesn't block the delete
  -- (no-op if there are no owners).
  UPDATE org_members SET role = 'admin' WHERE org_id = p_org_id AND role = 'owner';

  -- Delete org_members. The trigger only blocks if a row being
  -- deleted has role = 'owner' and it would be the last owner; with
  -- the demotion above (or no owners to begin with), this proceeds.
  DELETE FROM org_members WHERE org_id = p_org_id;

  SELECT ARRAY(SELECT id FROM teams WHERE org_id = p_org_id) INTO v_team_ids;

  IF array_length(v_team_ids, 1) > 0 THEN
    DELETE FROM activities WHERE team_id = ANY(v_team_ids);
    UPDATE teams SET parent_team_id = NULL WHERE org_id = p_org_id;
  END IF;

  DELETE FROM organizations WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_org(UUID) TO authenticated;
