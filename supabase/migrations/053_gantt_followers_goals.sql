-- Migration 053: Gantt support (task start dates + project key dates), task followers, and goals

-- =============================================
-- 1. Project key dates (for Gantt + project header)
-- =============================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date DATE;

-- =============================================
-- 2. Task start date (drives Gantt bars)
-- =============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;

-- =============================================
-- 3. Task followers
-- =============================================
CREATE TABLE IF NOT EXISTS task_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_followers_task ON task_followers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_followers_user ON task_followers(user_id);

ALTER TABLE task_followers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can view task followers" ON task_followers;
  CREATE POLICY "Members can view task followers"
    ON task_followers FOR SELECT TO authenticated
    USING (
      task_id IN (
        SELECT t.id FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can follow tasks" ON task_followers;
  CREATE POLICY "Members can follow tasks"
    ON task_followers FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      OR task_id IN (
        SELECT t.id FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Members can unfollow tasks" ON task_followers;
  CREATE POLICY "Members can unfollow tasks"
    ON task_followers FOR DELETE TO authenticated
    USING (
      user_id = auth.uid()
      OR task_id IN (
        SELECT t.id FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =============================================
-- 4. Goals
-- =============================================
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'behind', 'complete')),
  due_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_org ON goals(organization_id);
CREATE INDEX IF NOT EXISTS idx_goals_team ON goals(team_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view goals for their orgs and teams" ON goals;
  CREATE POLICY "Users can view goals for their orgs and teams"
    ON goals FOR SELECT TO authenticated
    USING (
      (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IS NOT NULL)
      OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IS NOT NULL)
      OR owner_id = auth.uid()
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create goals for their orgs and teams" ON goals;
  CREATE POLICY "Users can create goals for their orgs and teams"
    ON goals FOR INSERT TO authenticated
    WITH CHECK (
      (organization_id IS NULL OR user_org_role(organization_id, auth.uid()) IN ('owner', 'admin', 'member'))
      AND (team_id IS NULL OR user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update goals for their orgs and teams" ON goals;
  CREATE POLICY "Users can update goals for their orgs and teams"
    ON goals FOR UPDATE TO authenticated
    USING (
      (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IN ('owner', 'admin', 'member'))
      OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
      OR owner_id = auth.uid()
    )
    WITH CHECK (
      (organization_id IS NULL OR user_org_role(organization_id, auth.uid()) IN ('owner', 'admin', 'member'))
      AND (team_id IS NULL OR user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can delete goals for their orgs and teams" ON goals;
  CREATE POLICY "Users can delete goals for their orgs and teams"
    ON goals FOR DELETE TO authenticated
    USING (
      (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IN ('owner', 'admin'))
      OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin'))
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =============================================
-- 5. Goal -> project links
-- =============================================
CREATE TABLE IF NOT EXISTS goal_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(goal_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_projects_goal ON goal_projects(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_projects_project ON goal_projects(project_id);

ALTER TABLE goal_projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view goal project links" ON goal_projects;
  CREATE POLICY "Users can view goal project links"
    ON goal_projects FOR SELECT TO authenticated
    USING (
      goal_id IN (
        SELECT id FROM goals
        WHERE (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IS NOT NULL)
           OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IS NOT NULL)
           OR owner_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can link projects to goals" ON goal_projects;
  CREATE POLICY "Users can link projects to goals"
    ON goal_projects FOR INSERT TO authenticated
    WITH CHECK (
      goal_id IN (
        SELECT id FROM goals
        WHERE (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IN ('owner', 'admin', 'member'))
           OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
      )
      AND project_id IN (
        SELECT p.id FROM projects p
        JOIN team_members tm ON tm.team_id = p.team_id
        WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can unlink projects from goals" ON goal_projects;
  CREATE POLICY "Users can unlink projects from goals"
    ON goal_projects FOR DELETE TO authenticated
    USING (
      goal_id IN (
        SELECT id FROM goals
        WHERE (organization_id IS NOT NULL AND user_org_role(organization_id, auth.uid()) IN ('owner', 'admin', 'member'))
           OR (team_id IS NOT NULL AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
      )
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
