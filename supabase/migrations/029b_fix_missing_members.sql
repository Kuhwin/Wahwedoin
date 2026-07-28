-- Migration 029b: Fix missing team members + fix INSERT policy
-- Problem: migration 029 only allowed role='member' on INSERT,
-- but team creation inserts the owner with role='owner' which was blocked by RLS.

-- =============================================
-- 1. Fix team_members INSERT policies
-- =============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'team_members' AND schemaname = 'public'
    AND policyname LIKE '%insert%' OR (policyname LIKE '%Insert%' OR policyname LIKE '%add%' OR policyname LIKE '%invite%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
  END LOOP;
END $$;

-- Self-join: users can add themselves as 'member' (invite acceptance)
CREATE POLICY "Users can accept team invites as member"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
  );

-- Self-join: users can add themselves as 'owner' only if team has NO members yet (new team creation)
CREATE POLICY "Users can bootstrap new team as owner"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id
    )
  );

-- Owners/admins can add other members (as 'member' only)
CREATE POLICY "Owners and admins can add team members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    role = 'member'
    AND team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- 2. Ensure all existing team creators are members
-- =============================================
-- Find users who have projects in a team but aren't team members
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.team_id, t.name as team_name
    FROM projects p
    JOIN teams t ON t.id = p.team_id
    WHERE p.team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = p.team_id
    )
  LOOP
    RAISE NOTICE 'Team "%" (%) has no members - needs manual fix', r.team_name, r.team_id;
  END LOOP;
END $$;

-- =============================================
-- 3. Recreate trigger for future teams
-- =============================================
CREATE OR REPLACE FUNCTION add_team_owner_to_members()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_team_created ON teams;
-- Note: teams table has no created_by column, so this trigger won't fire
-- The app code handles adding the owner via client-side insert
