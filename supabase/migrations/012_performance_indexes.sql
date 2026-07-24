-- Performance indexes for frequently queried columns

-- Activities: queried by project_id and ordered by created_at
CREATE INDEX IF NOT EXISTS idx_activities_project_id_created_at
  ON activities (project_id, created_at DESC);

-- Activities: queried by team_id
CREATE INDEX IF NOT EXISTS idx_activities_team_id
  ON activities (team_id);

-- Activities: queried by user_id
CREATE INDEX IF NOT EXISTS idx_activities_user_id
  ON activities (user_id);

-- Tasks: queried by project_id and ordered by position
CREATE INDEX IF NOT EXISTS idx_tasks_project_id_position
  ON tasks (project_id, position);

-- Tasks: queried by parent_id (subtasks)
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id
  ON tasks (parent_id);

-- Tasks: queried by assignee_id
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id
  ON tasks (assignee_id);

-- Tasks: queried by status for filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);

-- Task comments: queried by task_id
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON task_comments (task_id);

-- Task tags: queried by task_id
CREATE INDEX IF NOT EXISTS idx_task_tags_task_id
  ON task_tags (task_id);

-- Task assignees: queried by task_id
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id
  ON task_assignees (task_id);

-- Task assignees: queried by user_id
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id
  ON task_assignees (user_id);

-- Task attachments: queried by task_id
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
  ON task_attachments (task_id);

-- Sections: queried by project_id
CREATE INDEX IF NOT EXISTS idx_sections_project_id
  ON sections (project_id);

-- Team members: queried by user_id and team_id
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON team_members (user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id
  ON team_members (team_id);

-- Projects: queried by team_id
CREATE INDEX IF NOT EXISTS idx_projects_team_id
  ON projects (team_id);

-- Projects: queried by status
CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status);

-- Notifications: queried by user_id and ordered by created_at
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON notifications (user_id, created_at DESC);

-- Tags: queried by team_id
CREATE INDEX IF NOT EXISTS idx_tags_team_id
  ON tags (team_id);
