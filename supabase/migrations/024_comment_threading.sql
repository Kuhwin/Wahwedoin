-- Migration 024: Comment threading — add parent_id to task_comments
-- Run manually in Supabase SQL Editor

-- Add parent_id for reply threading
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES task_comments(id) ON DELETE CASCADE;

-- Index for fast reply lookups
CREATE INDEX IF NOT EXISTS idx_task_comments_parent ON task_comments (parent_id) WHERE parent_id IS NOT NULL;
