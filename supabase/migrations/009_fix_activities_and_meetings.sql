-- Fix activities RLS: allow viewing activities via project_id access too
DROP POLICY IF EXISTS "Users can view their team activities" ON activities;
CREATE POLICY "Users can view their team activities"
  ON activities FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
    OR
    project_id IN (
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id);

-- Add specific date support to team_meetings (keep day_of_week for recurring)
ALTER TABLE team_meetings ADD COLUMN IF NOT EXISTS meeting_date DATE;
ALTER TABLE team_meetings ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT true;
