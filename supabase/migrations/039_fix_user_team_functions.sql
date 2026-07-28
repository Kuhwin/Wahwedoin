-- =============================================
-- Migration 039: Fix user_team_ids/role functions
-- auth.uid() inside SECURITY DEFINER functions can
-- return NULL. Fix: use passed-in parameter instead.
-- =============================================

-- Fix user_team_ids: use uid parameter, not auth.uid()
CREATE OR REPLACE FUNCTION user_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = uid;
$$;

-- Fix user_team_role: accept uid explicitly instead of calling auth.uid()
DROP FUNCTION IF EXISTS user_team_role(UUID);
CREATE OR REPLACE FUNCTION user_team_role(uid UUID, tid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM team_members WHERE user_id = uid AND team_id = tid LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION user_team_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_team_role(UUID, UUID) TO authenticated;

-- Update RLS policies that used the old 1-arg user_team_role(team_id)
-- to pass auth.uid() explicitly: user_team_role(auth.uid(), team_id)

-- Teams
DROP POLICY IF EXISTS "Members can update teams" ON teams;
DROP POLICY IF EXISTS "Owners and admins can delete teams" ON teams;
CREATE POLICY "Members can update teams" ON teams FOR UPDATE TO authenticated
  USING (user_team_role(auth.uid(), id) IN ('owner', 'admin'))
  WITH CHECK (user_team_role(auth.uid(), id) IN ('owner', 'admin'));
CREATE POLICY "Owners and admins can delete teams" ON teams FOR DELETE TO authenticated
  USING (user_team_role(auth.uid(), id) IN ('owner', 'admin'));

-- Projects
DROP POLICY IF EXISTS "Members can create projects" ON projects;
DROP POLICY IF EXISTS "Members can update projects" ON projects;
DROP POLICY IF EXISTS "Owners and admins can delete projects" ON projects;
CREATE POLICY "Members can create projects" ON projects FOR INSERT TO authenticated
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
  );
CREATE POLICY "Members can update projects" ON projects FOR UPDATE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
  )
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
  );
CREATE POLICY "Owners and admins can delete projects" ON projects FOR DELETE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );

-- Portfolios
DROP POLICY IF EXISTS "Members can create portfolios" ON portfolios;
CREATE POLICY "Members can create portfolios" ON portfolios FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );

-- portfolio_projects
DROP POLICY IF EXISTS "Members can create portfolio_projects" ON portfolio_projects;
DROP POLICY IF EXISTS "Members can delete portfolio_projects" ON portfolio_projects;
CREATE POLICY "Members can create portfolio_projects" ON portfolio_projects FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
    )
  );
CREATE POLICY "Members can delete portfolio_projects" ON portfolio_projects FOR DELETE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
    )
  );

-- custom_fields
DROP POLICY IF EXISTS "Members can manage custom_fields" ON custom_fields;
DROP POLICY IF EXISTS "Members can update custom_fields" ON custom_fields;
DROP POLICY IF EXISTS "Members can delete custom_fields" ON custom_fields;
CREATE POLICY "Members can manage custom_fields" ON custom_fields FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );
CREATE POLICY "Members can update custom_fields" ON custom_fields FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );
CREATE POLICY "Members can delete custom_fields" ON custom_fields FOR DELETE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- task_field_values
DROP POLICY IF EXISTS "Members can manage task_field_values" ON task_field_values;
DROP POLICY IF EXISTS "Members can update task_field_values" ON task_field_values;
DROP POLICY IF EXISTS "Members can delete task_field_values" ON task_field_values;
CREATE POLICY "Members can manage task_field_values" ON task_field_values FOR INSERT TO authenticated
  WITH CHECK (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );
CREATE POLICY "Members can update task_field_values" ON task_field_values FOR UPDATE TO authenticated
  USING (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  )
  WITH CHECK (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );
CREATE POLICY "Members can delete task_field_values" ON task_field_values FOR DELETE TO authenticated
  USING (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- activities
DROP POLICY IF EXISTS "Members can create activities" ON activities;
CREATE POLICY "Members can create activities" ON activities FOR INSERT TO authenticated
  WITH CHECK (
    (team_id IN (SELECT user_team_ids(auth.uid()))
     AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member'))
    OR (team_id IS NULL AND (
      project_id IN (
        SELECT p.id FROM projects p
        WHERE p.created_by = auth.uid()
      )
      OR project_id IS NULL
    ))
  );
