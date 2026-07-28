-- Ensure notification_preferences table exists (019 may not have been applied)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_assigned BOOLEAN DEFAULT true,
  task_due_soon BOOLEAN DEFAULT true,
  task_commented BOOLEAN DEFAULT true,
  team_invite BOOLEAN DEFAULT true,
  email_digest TEXT DEFAULT 'off' CHECK (email_digest IN ('off', 'daily', 'weekly')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'notification_preferences' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notification_preferences', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification preferences"
  ON notification_preferences FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
