-- Fix project RLS: allow operations on personal projects (team_id IS NULL)
-- or if user is a team member/admin

-- INSERT
DROP POLICY IF EXISTS "Team members can create projects" ON projects;
CREATE POLICY "Team members can create projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IS NULL
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Team members can update projects" ON projects;
CREATE POLICY "Team members can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    team_id IS NULL
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Team admins can delete projects" ON projects;
CREATE POLICY "Team admins can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    team_id IS NULL
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
