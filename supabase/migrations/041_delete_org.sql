CREATE OR REPLACE FUNCTION delete_org(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF (SELECT COUNT(*) FROM org_members WHERE org_id = p_org_id AND role = 'owner') = 0 THEN
    RAISE EXCEPTION 'Organization has no owner — cannot delete';
  END IF;

  -- Demote owners to admin so the trigger doesn't block the delete
  UPDATE org_members SET role = 'admin' WHERE org_id = p_org_id AND role = 'owner';

  -- Delete org_members (trigger won't block now since no rows have role='owner')
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
