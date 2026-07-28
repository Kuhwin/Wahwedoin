-- =============================================
-- Migration 037: Org members + management
-- =============================================

-- 1. Create org_members table
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Everyone can view org_members (for displaying who's in the org)
CREATE POLICY "Org members are viewable by authenticated users"
  ON org_members FOR SELECT
  TO authenticated
  USING (true);

-- Org owners/admins can insert members
CREATE POLICY "Org owners and admins can add members"
  ON org_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
    OR
    -- Allow users to bootstrap themselves as owner if the org has no members yet
    (role = 'owner' AND NOT EXISTS (SELECT 1 FROM org_members om2 WHERE om2.org_id = org_id))
  );

-- Org owners/admins can update member roles
CREATE POLICY "Org owners and admins can update members"
  ON org_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Non-owners cannot change owner role
    (role <> 'owner') OR
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

-- Org owners/admins can delete members; users can remove themselves
CREATE POLICY "Org owners and admins can remove members, users can leave"
  ON org_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Prevent removing the last owner
CREATE OR REPLACE FUNCTION prevent_remove_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    IF (SELECT COUNT(*) FROM org_members WHERE org_id = OLD.org_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the organization';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_remove_last_owner
  BEFORE DELETE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_remove_last_owner();

-- 2. Add UPDATE/DELETE policies to organizations table
CREATE POLICY "Org owners and admins can update organizations"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners can delete organizations"
  ON organizations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

-- 3. Update bootstrap_team_owner to also add org membership
CREATE OR REPLACE FUNCTION bootstrap_team_owner(p_team_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only add yourself as owner';
  END IF;

  IF EXISTS (SELECT 1 FROM team_members WHERE team_id = p_team_id) THEN
    RAISE EXCEPTION 'Team already has members';
  END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (p_team_id, p_user_id, 'owner');

  -- Also add as org admin if the team belongs to an org
  SELECT org_id INTO v_org_id FROM teams WHERE id = p_team_id;
  IF v_org_id IS NOT NULL THEN
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (v_org_id, p_user_id, 'admin')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION bootstrap_team_owner(p_team_id UUID, p_user_id UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_team_owner(p_team_id UUID, p_user_id UUID) TO authenticated;

-- 4. Grant authenticated users permission to insert into organizations
-- (so they can create orgs; they become owner via the bootstrap policy)
CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Add slug column to org_members for quick lookups by slug
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);

-- 6. Re-insert existing team creators as org admins for their orgs
INSERT INTO org_members (org_id, user_id, role)
SELECT DISTINCT t.org_id, tm.user_id, 'admin'
FROM teams t
JOIN team_members tm ON tm.team_id = t.id AND tm.role = 'owner'
WHERE t.org_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;
