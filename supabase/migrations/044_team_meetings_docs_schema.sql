-- Migration 044: Add team_meetings and team_docs CREATE TABLE statements
-- These tables were created in the Supabase Dashboard before the project adopted
-- migrations for all schema. This migration documents the schema and is safe
-- to run on a fresh DB (it uses IF NOT EXISTS). On the production DB the
-- tables already exist; the ALTER statements are also idempotent.

-- =============================================
-- team_meetings
-- =============================================
CREATE TABLE IF NOT EXISTS team_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  day_of_week INTEGER CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
  meeting_date DATE,
  is_recurring BOOLEAN DEFAULT true,
  time TEXT,
  duration_minutes INTEGER DEFAULT 30,
  meet_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view meetings" ON team_meetings;
CREATE POLICY "Team members can view meetings"
  ON team_meetings FOR SELECT TO authenticated
  USING (team_id IN (SELECT user_team_ids(auth.uid())));

DROP POLICY IF EXISTS "Owners and admins can manage meetings" ON team_meetings;
CREATE POLICY "Owners and admins can manage meetings"
  ON team_meetings FOR ALL TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );

-- =============================================
-- team_docs
-- =============================================
CREATE TABLE IF NOT EXISTS team_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT CHECK (category IN ('general', 'meeting_notes', 'sop', 'project_brief')) DEFAULT 'general',
  pinned BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view docs" ON team_docs;
CREATE POLICY "Team members can view docs"
  ON team_docs FOR SELECT TO authenticated
  USING (team_id IN (SELECT user_team_ids(auth.uid())));

DROP POLICY IF EXISTS "Owners and admins can manage docs" ON team_docs;
CREATE POLICY "Owners and admins can manage docs"
  ON team_docs FOR ALL TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_team_meetings_team ON team_meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_team_docs_team ON team_docs(team_id);
CREATE INDEX IF NOT EXISTS idx_team_docs_pinned ON team_docs(team_id, pinned) WHERE pinned = true;
