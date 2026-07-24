-- Custom fields for projects
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'dropdown', 'date')),
  options JSONB DEFAULT '[]'::jsonb,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task field values
CREATE TABLE IF NOT EXISTS task_field_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, field_id)
);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_field_values ENABLE ROW LEVEL SECURITY;

-- RLS: custom_fields visible to anyone who can see the project
CREATE POLICY "Custom fields visible via project access" ON custom_fields
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid() OR p.team_id IS NULL
    )
  );

CREATE POLICY "Users can manage custom fields" ON custom_fields
  FOR ALL USING (
    project_id IN (
      SELECT p.id FROM projects p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid() OR p.team_id IS NULL
    )
  );

-- RLS: task_field_values visible via task project access
CREATE POLICY "Field values visible via task access" ON task_field_values
  FOR SELECT USING (
    task_id IN (
      SELECT t.id FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN teams tm2 ON p.team_id = tm2.id
      LEFT JOIN team_members tm ON tm2.id = tm.team_id
      WHERE tm.user_id = auth.uid() OR p.team_id IS NULL
    )
  );

CREATE POLICY "Users can manage field values" ON task_field_values
  FOR ALL USING (
    task_id IN (
      SELECT t.id FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN teams tm2 ON p.team_id = tm2.id
      LEFT JOIN team_members tm ON tm2.id = tm.team_id
      WHERE tm.user_id = auth.uid() OR p.team_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_custom_fields_project_id ON custom_fields (project_id);
CREATE INDEX IF NOT EXISTS idx_task_field_values_task_id ON task_field_values (task_id);
CREATE INDEX IF NOT EXISTS idx_task_field_values_field_id ON task_field_values (field_id);
