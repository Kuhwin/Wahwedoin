-- Migration 049: SECURITY DEFINER RPC for cover photo updates
-- The RLS UPDATE policies on organizations and teams sometimes fail
-- silently for admin users (returning 0 rows). Using a SECURITY DEFINER
-- function bypasses the issue and matches the pattern used for
-- update_org_name (migration 040).

CREATE OR REPLACE FUNCTION update_org_cover(p_org_id UUID, p_cover_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_url TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only org owners and admins can update the cover photo';
  END IF;

  UPDATE organizations
     SET cover_photo_url = p_cover_url
   WHERE id = p_org_id
  RETURNING cover_photo_url INTO v_new_url;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN v_new_url;
END;
$$;

CREATE OR REPLACE FUNCTION update_team_cover(p_team_id UUID, p_cover_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_url TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only team owners and admins can update the cover photo';
  END IF;

  UPDATE teams
     SET cover_photo_url = p_cover_url
   WHERE id = p_team_id
  RETURNING cover_photo_url INTO v_new_url;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  RETURN v_new_url;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_org_cover(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_org_cover(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION update_team_cover(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_team_cover(UUID, TEXT) TO authenticated;
