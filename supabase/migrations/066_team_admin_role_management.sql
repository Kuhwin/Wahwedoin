-- Migration 066: team admins may manage non-owner roles

CREATE OR REPLACE FUNCTION update_team_member_role(
  p_member_id UUID,
  p_new_role TEXT
)
RETURNS team_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target team_members;
  v_caller_role TEXT;
  v_updated team_members;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_new_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid team role';
  END IF;

  SELECT * INTO v_target FROM team_members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found'; END IF;

  SELECT role INTO v_caller_role
  FROM team_members
  WHERE team_id = v_target.team_id AND user_id = v_uid;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only team owners and admins can change member roles';
  END IF;
  IF p_new_role = 'owner' AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only team owners can promote an owner';
  END IF;
  IF v_target.role = 'owner' AND p_new_role <> 'owner' THEN
    IF v_caller_role <> 'owner' THEN
      RAISE EXCEPTION 'Only team owners can demote an owner';
    END IF;
    IF (SELECT COUNT(*) FROM team_members WHERE team_id = v_target.team_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of the team';
    END IF;
  END IF;

  UPDATE team_members SET role = p_new_role WHERE id = p_member_id RETURNING * INTO v_updated;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_team_member_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_team_member_role(UUID, TEXT) TO authenticated;
