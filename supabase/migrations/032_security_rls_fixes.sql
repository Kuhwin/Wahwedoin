-- Migration 032: Fix critical RLS vulnerabilities
-- C2: task_tags wide open → team-scoped
-- C3: projects personal escape → scope to creator
-- C4: custom_fields/task_field_values personal escape → scope to creator
-- C5: user_team_ids() not restricted → restrict invocation
-- H3: activities INSERT wide open → team-scoped
-- H4: team_members DELETE/UPDATE self-subquery → use helper

-- =============================================
-- C5 + H4: Create helper functions
-- =============================================

-- Fix user_team_ids: ignore parameter, always use auth.uid()
-- This prevents users from querying other users' teams
CREATE OR REPLACE FUNCTION user_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid();
$$;

-- New helper: get user's role in a team (avoids self-referencing subqueries)
CREATE OR REPLACE FUNCTION user_team_role(tid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM team_members WHERE user_id = auth.uid() AND team_id = tid LIMIT 1;
$$;

-- Restrict direct invocation (policies can still call via SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION user_team_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_team_ids(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION user_team_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_team_role(UUID) TO authenticated;

-- =============================================
-- H4: Fix team_members DELETE/UPDATE policies
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'team_members' AND schemaname = 'public'
    AND policyname IN (
      'Owners remove members or self-leave',
      'Owners update member roles'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Owners remove members or self-leave"
  ON team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR user_team_role(team_id) IN ('owner', 'admin')
  );

CREATE POLICY "Owners update member roles"
  ON team_members FOR UPDATE TO authenticated
  USING (user_team_role(team_id) = 'owner')
  WITH CHECK (user_team_role(team_id) = 'owner');

-- =============================================
-- C2: Fix task_tags — team-scoped via task→project→team_members
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'task_tags' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON task_tags', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view task_tags"
  ON task_tags FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
    )
    OR task_id IN (
      SELECT t.id FROM tasks t
      WHERE t.project_id IS NULL
      AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Team members can manage task_tags"
  ON task_tags FOR ALL TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
    )
    OR task_id IN (
      SELECT t.id FROM tasks t
      WHERE t.project_id IS NULL
      AND t.created_by = auth.uid()
    )
  );

-- =============================================
-- C3: Fix projects — scope personal to creator
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

CREATE POLICY "Users can create projects"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR team_id IN (SELECT user_team_ids(auth.uid()))
  );

CREATE POLICY "Team members can update projects"
  ON projects FOR UPDATE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR team_id IN (SELECT user_team_ids(auth.uid()))
  )
  WITH CHECK (
    (team_id IS NULL AND created_by = auth.uid())
    OR team_id IN (SELECT user_team_ids(auth.uid()))
  );

CREATE POLICY "Owners can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR user_team_role(team_id) IN ('owner', 'admin')
  );

-- =============================================
-- C4: Fix custom_fields — scope via project→team_members
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'custom_fields' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON custom_fields', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view custom_fields"
  ON custom_fields FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
         OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Team members can manage custom_fields"
  ON custom_fields FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
         OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- Fix task_field_values — scope via custom_field→project→team_members
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'task_field_values' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON task_field_values', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view task_field_values"
  ON task_field_values FOR SELECT TO authenticated
  USING (
    custom_field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
         OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

CREATE POLICY "Team members can manage task_field_values"
  ON task_field_values FOR ALL TO authenticated
  USING (
    custom_field_id IN (
      SELECT cf.id FROM custom_fields cf
      JOIN projects p ON p.id = cf.project_id
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
         OR (p.team_id IS NULL AND p.created_by = auth.uid())
    )
  );

-- =============================================
-- H3: Fix activities INSERT — team-scoped
-- =============================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'activities' AND schemaname = 'public'
    AND policyname = 'System can create activities'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON activities', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "System can create activities"
  ON activities FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    OR (team_id IS NULL AND (
      project_id IN (
        SELECT p.id FROM projects p
        WHERE p.created_by = auth.uid()
      )
      OR project_id IS NULL
    ))
  );
