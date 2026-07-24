-- Make org_id nullable (teams don't need an org to start)
ALTER TABLE teams ALTER COLUMN org_id DROP NOT NULL;

-- Fix team_members RLS: allow users to add themselves as owner of a new team
DROP POLICY IF EXISTS "Team admins can add members" ON team_members;

CREATE POLICY "Team admins can add members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
