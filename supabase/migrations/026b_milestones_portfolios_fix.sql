-- Migration 026b: Fix for 026 partial run
-- The task_projects table + policies already exist, just add missing pieces

-- 1. Milestone index (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks (project_id, is_milestone) WHERE is_milestone = true;

-- 2. Portfolios
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_team ON portfolios (team_id);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view portfolios in their teams' AND tablename = 'portfolios') THEN
    CREATE POLICY "Users can view portfolios in their teams"
      ON portfolios FOR SELECT TO authenticated
      USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create portfolios in their teams' AND tablename = 'portfolios') THEN
    CREATE POLICY "Users can create portfolios in their teams"
      ON portfolios FOR INSERT TO authenticated
      WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own portfolios' AND tablename = 'portfolios') THEN
    CREATE POLICY "Users can update their own portfolios"
      ON portfolios FOR UPDATE TO authenticated
      USING (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own portfolios' AND tablename = 'portfolios') THEN
    CREATE POLICY "Users can delete their own portfolios"
      ON portfolios FOR DELETE TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;

-- 3. Portfolio <-> Project junction
CREATE TABLE IF NOT EXISTS portfolio_projects (
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (portfolio_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_projects_portfolio ON portfolio_projects (portfolio_id);

ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view portfolio_projects via portfolio access' AND tablename = 'portfolio_projects') THEN
    CREATE POLICY "Users can view portfolio_projects via portfolio access"
      ON portfolio_projects FOR SELECT TO authenticated
      USING (
        portfolio_id IN (
          SELECT id FROM portfolios
          WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage portfolio_projects via portfolio access' AND tablename = 'portfolio_projects') THEN
    CREATE POLICY "Users can manage portfolio_projects via portfolio access"
      ON portfolio_projects FOR ALL TO authenticated
      USING (
        portfolio_id IN (
          SELECT id FROM portfolios
          WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
        )
      );
  END IF;
END $$;
