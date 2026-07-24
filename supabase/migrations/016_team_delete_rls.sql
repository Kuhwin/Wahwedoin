-- Add DELETE policy for teams: owners and admins only
CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
