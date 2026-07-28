-- Migration 035: Fix team creation RLS
-- Problem: Creating a team inserts into teams (OK), then inserts into team_members with role='owner'.
-- The team_members INSERT policies only allow role='member', so adding yourself as owner fails.
-- Fix: Allow inserting yourself as 'owner' when you are the first member of a team.

-- Fix teams INSERT policy — ensure all authenticated users can create teams
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'teams' AND schemaname = 'public'
    AND policyname LIKE '%create%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON teams', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (true);

-- Fix team_members INSERT — allow users to add themselves as 'owner' when first member
CREATE POLICY "Team creators can add themselves as owner"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = public.team_members.team_id
    )
  );