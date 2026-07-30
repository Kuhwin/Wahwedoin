-- Track which notifications have been dispatched via email
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Index for the cron query: find unsent notifications efficiently
CREATE INDEX IF NOT EXISTS idx_notifications_email_unsent
  ON notifications (created_at)
  WHERE email_sent_at IS NULL;
