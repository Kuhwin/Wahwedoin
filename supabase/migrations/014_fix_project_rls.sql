-- Fix project RLS for personal projects (team_id IS NULL)
-- DELETE stays restricted to owners/admins per business rules

-- SELECT: allow viewing personal projects too
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

-- INSERT: allow creating personal projects too
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

-- UPDATE: allow updating personal projects too
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

-- DELETE: owners and admins only (kept as-is from original)
DROP POLICY IF EXISTS "Team admins can delete projects" ON projects;
DROP POLICY IF EXISTS "Team members can delete projects" ON projects;
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
