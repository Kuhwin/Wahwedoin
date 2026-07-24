-- Fix project RLS: allow any team member to manage their projects
-- and allow personal projects (team_id IS NULL) too

-- SELECT
DROP POLICY IF EXISTS "Users can view their team projects" ON projects;
CREATE POLICY "Users can view their team projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    team_id IS NULL
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

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
CREATE POLICY "Team members can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    team_id IS NULL
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );
