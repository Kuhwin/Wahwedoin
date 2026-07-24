-- Multiple assignees junction table
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Migrate existing single assignee data
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assignees on their tasks"
  ON task_assignees FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can manage assignees"
  ON task_assignees FOR ALL TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
    )
  );
