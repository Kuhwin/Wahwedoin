-- Add recurrence support to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence ON tasks(recurrence);
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_parent ON tasks(recurring_parent_id);
