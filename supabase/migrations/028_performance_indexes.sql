-- Migration 028: Performance indexes
-- Run manually in Supabase SQL Editor

-- Activities pagination (dashboard "load all" query)
CREATE INDEX IF NOT EXISTS idx_activities_created_at_desc
  ON activities (created_at DESC);

-- Activities by task (task detail modal)
CREATE INDEX IF NOT EXISTS idx_activities_task_id_created_at
  ON activities (task_id, created_at DESC);
