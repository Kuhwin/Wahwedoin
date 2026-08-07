-- Migration 064: allow authorized organization deletion with owner guards
--
-- The owner-protection triggers correctly prevent normal users from removing
-- the last owner, but they also fire while an authorized delete_org operation
-- is removing the entire organization. Disable them only for this atomic,
-- authorization-checked operation and restore them before returning.

CREATE OR REPLACE FUNCTION delete_org(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_ids UUID[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only org owners and admins can delete an organization';
  END IF;

  ALTER TABLE public.org_members DISABLE TRIGGER trg_prevent_remove_last_owner;
  ALTER TABLE public.org_members DISABLE TRIGGER trg_prevent_demote_last_owner;

  SELECT ARRAY(SELECT id FROM teams WHERE org_id = p_org_id) INTO v_team_ids;

  IF array_length(v_team_ids, 1) > 0 THEN
    DELETE FROM activities WHERE team_id = ANY(v_team_ids);
    UPDATE teams SET parent_team_id = NULL WHERE org_id = p_org_id;
  END IF;

  DELETE FROM organizations WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  ALTER TABLE public.org_members ENABLE TRIGGER trg_prevent_remove_last_owner;
  ALTER TABLE public.org_members ENABLE TRIGGER trg_prevent_demote_last_owner;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_org(UUID) TO authenticated;
