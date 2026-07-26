-- Junction table for events shared across multiple teams
CREATE TABLE IF NOT EXISTS event_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, team_id)
);

ALTER TABLE event_teams ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Team members can view event-team links" ON event_teams;
  CREATE POLICY "Team members can view event-team links"
    ON event_teams FOR SELECT
    USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Team members can create event-team links" ON event_teams;
  CREATE POLICY "Team members can create event-team links"
    ON event_teams FOR INSERT
    WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Team members can delete event-team links" ON event_teams;
  CREATE POLICY "Team members can delete event-team links"
    ON event_teams FOR DELETE
    USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Junction table for events assigned to projects (departments)
CREATE TABLE IF NOT EXISTS event_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, project_id)
);

ALTER TABLE event_projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view event-project links for their projects" ON event_projects;
  CREATE POLICY "Users can view event-project links for their projects"
    ON event_projects FOR SELECT
    USING (project_id IN (SELECT p.id FROM projects p JOIN team_members tm ON tm.team_id = p.team_id WHERE tm.user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create event-project links for their projects" ON event_projects;
  CREATE POLICY "Users can create event-project links for their projects"
    ON event_projects FOR INSERT
    WITH CHECK (project_id IN (SELECT p.id FROM projects p JOIN team_members tm ON tm.team_id = p.team_id WHERE tm.user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete event-project links for their projects" ON event_projects;
  CREATE POLICY "Users can delete event-project links for their projects"
    ON event_projects FOR DELETE
    USING (project_id IN (SELECT p.id FROM projects p JOIN team_members tm ON tm.team_id = p.team_id WHERE tm.user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Migrate existing single-team events to the junction table
INSERT INTO event_teams (event_id, team_id)
SELECT id, team_id FROM events WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_teams_event ON event_teams(event_id);
CREATE INDEX IF NOT EXISTS idx_event_teams_team ON event_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_event_projects_event ON event_projects(event_id);
CREATE INDEX IF NOT EXISTS idx_event_projects_project ON event_projects(project_id);
