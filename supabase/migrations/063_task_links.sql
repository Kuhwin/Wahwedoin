-- Migration 063: task website links

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
