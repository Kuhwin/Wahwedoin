-- Migration 023: Add task_id to activities for per-task activity logging
-- Run manually in Supabase SQL Editor

-- Add task_id column
ALTER TABLE activities ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Add index for fast per-task lookups
CREATE INDEX IF NOT EXISTS idx_activities_task_id ON activities (task_id, created_at DESC);
