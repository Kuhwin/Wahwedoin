-- Migration 036: Role-based access control
-- Adds 'viewer' as a supported role, fixes admin powers, and enforces
-- viewer read-only restrictions across all tables.

-- =============================================
-- 0. Ensure helper functions exist
-- =============================================

CREATE OR REPLACE FUNCTION user_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION user_team_role(tid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM team_members WHERE user_id = auth.uid() AND team_id = tid LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION user_team_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_team_ids(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION user_team_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_team_role(UUID) TO authenticated;

-- =============================================
-- 1. SECURITY DEFINER function for team bootstrapping
--    Bypasses RLS to let the creator add themselves as
--    the first owner of a newly created team.
-- =============================================

CREATE OR REPLACE FUNCTION bootstrap_team_owner(team_id UUID, user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only add yourself as owner';
  END IF;

  IF EXISTS (SELECT 1 FROM team_members WHERE team_id = bootstrap_team_owner.team_id) THEN
    RAISE EXCEPTION 'Team already has members';
  END IF;

  INSERT INTO team_members (team_id, user_id, role)
  VALUES (team_id, user_id, 'owner');
END;
$$;

REVOKE EXECUTE ON FUNCTION bootstrap_team_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_team_owner(UUID, UUID) TO authenticated;

-- Drop the old RLS-based bootstrap policies (they're unreliable)
DROP POLICY IF EXISTS "Users bootstrap new team as owner" ON team_members;
DROP POLICY IF EXISTS "Team creators can add themselves as owner" ON team_members;

-- =============================================
-- 2. Add 'viewer' to team_members role constraint
-- =============================================
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- =============================================
-- 3. Fix teams — admin can update/delete
-- =============================================
DROP POLICY IF EXISTS "Owners update teams" ON teams;
DROP POLICY IF EXISTS "Owners delete teams" ON teams;

CREATE POLICY "Owners and admins update teams"
  ON teams FOR UPDATE TO authenticated
  USING (user_team_role(id) IN ('owner', 'admin'))
  WITH CHECK (user_team_role(id) IN ('owner', 'admin'));

CREATE POLICY "Owners and admins delete teams"
  ON teams FOR DELETE TO authenticated
  USING (user_team_role(id) IN ('owner', 'admin'));

-- =============================================
-- 3. Fix projects — viewers read-only
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'projects' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON projects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view projects"
  ON projects FOR SELECT TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR team_id IN (SELECT user_team_ids(auth.uid()))
  );

CREATE POLICY "Members can create projects"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(team_id) IN ('owner', 'admin', 'member'))
  );

CREATE POLICY "Members can update projects"
  ON projects FOR UPDATE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(team_id) IN ('owner', 'admin', 'member'))
  )
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR (team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(team_id) IN ('owner', 'admin', 'member'))
  );

CREATE POLICY "Owners and admins can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR user_team_role(team_id) IN ('owner', 'admin')
  );

-- =============================================
-- 4. Fix task_comments — members+ can create
-- =============================================
DROP POLICY IF EXISTS "Team members can create comments" ON task_comments;

CREATE POLICY "Members can create comments"
  ON task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
    )
  );

-- =============================================
-- 5. Fix event_teams — viewers read-only
-- =============================================
DROP POLICY IF EXISTS "Team members can create event-team links" ON event_teams;
DROP POLICY IF EXISTS "Team members can delete event-team links" ON event_teams;

CREATE POLICY "Members can create event-team links"
  ON event_teams FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members
                WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member'))
  );

CREATE POLICY "Members can delete event-team links"
  ON event_teams FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members
                WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member'))
  );

-- =============================================
-- 6. Fix event_projects — viewers read-only
-- =============================================
DROP POLICY IF EXISTS "Users can create event-project links for their projects" ON event_projects;
DROP POLICY IF EXISTS "Users can delete event-project links for their projects" ON event_projects;

CREATE POLICY "Members can create event-project links"
  ON event_projects FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members can delete event-project links"
  ON event_projects FOR DELETE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin', 'member')
    )
  );

-- =============================================
-- 7. Fix portfolios — viewers read-only
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'portfolios' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON portfolios', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view portfolios in their teams"
  ON portfolios FOR SELECT TO authenticated
  USING (team_id IN (SELECT user_team_ids(auth.uid())));

CREATE POLICY "Members can create portfolios"
  ON portfolios FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(team_id) IN ('owner', 'admin', 'member')
  );

CREATE POLICY "Users can update own portfolios"
  ON portfolios FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own portfolios"
  ON portfolios FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- =============================================
-- 8. Fix portfolio_projects — viewers read-only
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'portfolio_projects' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON portfolio_projects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view portfolio_projects"
  ON portfolio_projects FOR SELECT TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT user_team_ids(auth.uid()))
    )
  );

CREATE POLICY "Members can create portfolio_projects"
  ON portfolio_projects FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(team_id) IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members can delete portfolio_projects"
  ON portfolio_projects FOR DELETE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios
      WHERE team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(team_id) IN ('owner', 'admin', 'member')
    )
  );

-- =============================================
-- 9. Fix custom_fields — viewers read-only
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'custom_fields' AND schemaname = 'public'
    AND policyname LIKE '%manage%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON custom_fields', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Members can manage custom_fields"
  ON custom_fields FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Members can update custom_fields"
  ON custom_fields FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Members can delete custom_fields"
  ON custom_fields FOR DELETE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- =============================================
-- 10. Fix task_field_values — viewers read-only
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'task_field_values' AND schemaname = 'public'
    AND policyname LIKE '%manage%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON task_field_values', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Members can manage task_field_values"
  ON task_field_values FOR INSERT TO authenticated
  WITH CHECK (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Members can update task_field_values"
  ON task_field_values FOR UPDATE TO authenticated
  USING (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  )
  WITH CHECK (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Members can delete task_field_values"
  ON task_field_values FOR DELETE TO authenticated
  USING (
    field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(p.team_id) IN ('owner', 'admin', 'member')
      OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- =============================================
-- 11. Fix activities — viewers read-only
-- =============================================
DROP POLICY IF EXISTS "System can create activities" ON activities;

CREATE POLICY "Members can create activities"
  ON activities FOR INSERT TO authenticated
  WITH CHECK (
    (team_id IN (SELECT user_team_ids(auth.uid()))
     AND user_team_role(team_id) IN ('owner', 'admin', 'member'))
    OR (team_id IS NULL AND (
      project_id IN (
        SELECT p.id FROM projects p
        WHERE p.created_by = auth.uid()
      )
      OR project_id IS NULL
    ))
  );