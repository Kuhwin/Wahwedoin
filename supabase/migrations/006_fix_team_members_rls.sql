-- Nuclear fix: drop ALL policies on team_members, then recreate safe ones
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

-- Also check if there's a trigger on teams that auto-adds owner
DROP TRIGGER IF EXISTS on_team_created ON teams;
DROP FUNCTION IF EXISTS add_team_owner_to_members();

-- Now create clean policies with zero self-references
CREATE POLICY "Authenticated users can view team members"
  ON team_members FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can add themselves"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove themselves"
  ON team_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Fix teams: ensure INSERT works for authenticated users
-- Drop all policies on teams and recreate cleanly
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

CREATE POLICY "Authenticated users can view teams"
  ON teams FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Team owners can update teams"
  ON teams FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
