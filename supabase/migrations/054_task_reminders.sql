-- Task reminders: an optional timestamp on the task that triggers a
-- notification when reached.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tasks_reminder_at_idx
  ON tasks (reminder_at)
  WHERE reminder_at IS NOT NULL AND status <> 'done';
