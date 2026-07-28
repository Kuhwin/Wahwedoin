-- Migration 033: Add color and display_label to user_google_accounts

-- 16 accent colors matching the app's accent palette
ALTER TABLE user_google_accounts ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE user_google_accounts ADD COLUMN IF NOT EXISTS display_label TEXT;

-- Assign colors to existing accounts (cycle through palette)
DO $$
DECLARE
  palette TEXT[] := ARRAY[
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#3b82f6'
  ];
  rec RECORD;
  idx INTEGER := 0;
BEGIN
  FOR rec IN SELECT id FROM user_google_accounts ORDER BY created_at
  LOOP
    UPDATE user_google_accounts SET color = palette[(idx % 16) + 1] WHERE id = rec.id;
    idx := idx + 1;
  END LOOP;
END $$;
