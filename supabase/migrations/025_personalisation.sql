-- Migration 025: Personalisation — accent colour, personal tags, saved views
-- Run manually in Supabase SQL Editor

-- 1. Add accent_colour to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS accent_colour TEXT DEFAULT '#6366f1';

-- 2. Add user_id to tags for personal tag presets (nullable — null means team tag)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for personal tag lookups
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags (user_id) WHERE user_id IS NOT NULL;

-- 3. Saved views table — user's saved filter/sort combos
CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  sort_by TEXT DEFAULT 'created_at',
  sort_order TEXT DEFAULT 'desc',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views (user_id);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own saved views"
  ON saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
