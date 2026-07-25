-- Add recurrence support to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_end DATE;

-- Add event_id to tasks for task-event linking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
