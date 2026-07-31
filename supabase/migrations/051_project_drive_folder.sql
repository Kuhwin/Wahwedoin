-- Migration 051: Link a Google Drive folder to a project
-- Adds optional drive linking columns to projects. Projects can point at a
-- folder in one of the team's linked Google accounts so members can see the
-- folder's files right on the project page.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS drive_account_id UUID REFERENCES user_google_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_name TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_drive_folder ON projects(drive_account_id, drive_folder_id);
