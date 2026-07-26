-- Migration 026: Milestones, Multi-homing, Portfolios
-- Run manually in Supabase SQL Editor

-- =============================================
-- 1. MILESTONES
-- =============================================
-- Milestones are tasks with is_milestone = true
-- They show as diamond markers in the project view
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks (project_id, is_milestone) WHERE is_milestone = true;

-- =============================================
-- 2. MULTI-HOMING (task belongs to multiple projects)
-- =============================================
CREATE TABLE IF NOT EXISTS task_projects (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (task_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_task_projects_project ON task_projects (project_id);

ALTER TABLE task_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task_projects via project access"
  ON task_projects FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage task_projects via project access"
  ON task_projects FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- =============================================
-- 3. PORTFOLIOS
-- =============================================
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

CREATE POLICY "Users can view portfolios in their teams"
  ON portfolios FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create portfolios in their teams"
  ON portfolios FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own portfolios"
  ON portfolios FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own portfolios"
  ON portfolios FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Portfolio <-> Project junction
CREATE TABLE IF NOT EXISTS portfolio_projects (
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (portfolio_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_projects_portfolio ON portfolio_projects (portfolio_id);

ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view portfolio_projects via portfolio access"
  ON portfolio_projects FOR SELECT TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage portfolio_projects via portfolio access"
  ON portfolio_projects FOR ALL TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );
