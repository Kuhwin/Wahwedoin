-- =============================================
-- Migration 040: SECURITY DEFINER RPC for org updates
-- Bypasses RLS to ensure org name updates work
-- reliably regardless of auth.uid() behavior.
-- =============================================

CREATE OR REPLACE FUNCTION update_org_name(p_org_id UUID, p_new_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only org owners and admins can update the organization name';
  END IF;

  UPDATE organizations SET name = p_new_name WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_org_name(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_org_name(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION update_org_member_role(p_member_id UUID, p_new_role TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM org_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = v_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage members';
  END IF;

  UPDATE org_members SET role = p_new_role WHERE id = p_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_org_member_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_org_member_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION delete_org_member(p_member_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, user_id, role INTO v_org_id, v_user_id, v_role FROM org_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Allow self-removal
  IF v_user_id = auth.uid() THEN
    DELETE FROM org_members WHERE id = p_member_id;
    RETURN;
  END IF;

  -- Owners/admins can remove others
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = v_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to remove members';
  END IF;

  -- Prevent removing the last owner
  IF v_role = 'owner' AND (SELECT COUNT(*) FROM org_members WHERE org_id = v_org_id AND role = 'owner') <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last owner';
  END IF;

  DELETE FROM org_members WHERE id = p_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_org_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_org_member(UUID) TO authenticated;
