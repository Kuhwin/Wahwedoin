-- Migration 029: Critical Security Fixes — RLS Hardening
-- Fixes: team_members SELECT/INSERT, teams SELECT/UPDATE/INSERT

-- =============================================
-- 1. FIX team_members RLS
-- =============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'team_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
  END LOOP;
END $$;

-- SELECT: only see members of teams you belong to
CREATE POLICY "Team members can view own team members"
  ON team_members FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: only owners/admins can add members, and new members must be added as 'member' role
CREATE POLICY "Owners and admins can add team members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    role = 'member'
    AND team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- Self-join policy: users can add themselves only as 'member' (for accepting invites)
CREATE POLICY "Users can accept team invites as member"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
  );

-- DELETE: owners/admins can remove members, users can remove themselves
CREATE POLICY "Owners and admins can remove team members"
  ON team_members FOR DELETE TO authenticated
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
    OR user_id = auth.uid()
  );

-- UPDATE: only owners can change roles
CREATE POLICY "Owners can update team member roles"
  ON team_members FOR UPDATE TO authenticated
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role = 'owner'
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role = 'owner'
    )
  );

-- =============================================
-- 2. FIX teams RLS
-- =============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'teams' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON teams', pol.policyname);
  END LOOP;
END $$;

-- SELECT: only see teams you belong to
CREATE POLICY "Members can view own teams"
  ON teams FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can create a team (becomes owner)
CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: only owners can update team details
CREATE POLICY "Team owners can update teams"
  ON teams FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- DELETE: only owners can delete teams
CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE TO authenticated
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
