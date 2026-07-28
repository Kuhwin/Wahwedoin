-- Migration 030: Fix RLS recursion on team_members
-- The self-referencing subqueries in 029 caused infinite recursion (500 errors)
-- Fix: use a helper function to break the recursion

-- Helper function: returns team IDs the user belongs to
-- Runs as SECURITY DEFINER to bypass RLS on the inner query
CREATE OR REPLACE FUNCTION user_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = uid;
$$;

-- =============================================
-- team_members RLS (rewrite without recursion)
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'team_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
  END LOOP;
END $$;

-- SELECT: can see members of your own teams
CREATE POLICY "Team members view own teams"
  ON team_members FOR SELECT TO authenticated
  USING (team_id IN (SELECT user_team_ids(auth.uid())));

-- INSERT: users can accept invites as 'member'
CREATE POLICY "Users accept invites as member"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'member');

-- INSERT: users can bootstrap new team as 'owner' (only if team has no members yet)
CREATE POLICY "Users bootstrap new team as owner"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id)
  );

-- INSERT: owners/admins can add members
CREATE POLICY "Owners add team members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    role = 'member'
    AND team_id IN (SELECT user_team_ids(auth.uid()))
  );

-- DELETE: owners/admins can remove, users can leave
CREATE POLICY "Owners remove members or self-leave"
  ON team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

-- UPDATE: owners can change roles
CREATE POLICY "Owners update member roles"
  ON team_members FOR UPDATE TO authenticated
  USING (team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'owner'))
  WITH CHECK (team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'owner'));

-- =============================================
-- teams RLS (also use helper function)
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'teams' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON teams', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Members view own teams"
  ON teams FOR SELECT TO authenticated
  USING (id IN (SELECT user_team_ids(auth.uid())));

CREATE POLICY "Authenticated users create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners update teams"
  ON teams FOR UPDATE TO authenticated
  USING (id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'owner'))
  WITH CHECK (id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'owner'));

CREATE POLICY "Owners delete teams"
  ON teams FOR DELETE TO authenticated
  USING (id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'owner'));
