-- =============================================
-- Migration 039: Fix user_team_ids/role functions
-- auth.uid() inside SECURITY DEFINER functions can
-- return NULL because the function runs as the
-- definer (postgres), not as the calling user.
-- Fix: use the passed-in parameter instead.
-- =============================================

-- Fix user_team_ids: use the uid parameter, not auth.uid()
CREATE OR REPLACE FUNCTION user_team_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = uid;
$$;

-- Fix user_team_role: accept both uid and tid, use the parameters
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

-- Update all RLS policies to pass auth.uid() explicitly
-- (auth.uid() in the policy context is the calling user, not the function definer)

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

-- Task comments
DROP POLICY IF EXISTS "Members can create comments" ON task_comments;
CREATE POLICY "Members can create comments" ON task_comments FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );

-- Custom fields
DROP POLICY IF EXISTS "Members can create custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Members can update custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Owners can delete custom fields" ON custom_fields;
CREATE POLICY "Members can create custom fields" ON custom_fields FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "Members can update custom fields" ON custom_fields FOR UPDATE TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "Owners can delete custom fields" ON custom_fields FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );

-- Activities
DROP POLICY IF EXISTS "Members can create activities" ON activities;
DROP POLICY IF EXISTS "Members can delete activities" ON activities;
CREATE POLICY "Members can create activities" ON activities FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "Members can delete activities" ON activities FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );

-- Event policies
DROP POLICY IF EXISTS "Members can create event-team links" ON event_teams;
DROP POLICY IF EXISTS "Members can delete event-team links" ON event_teams;
CREATE POLICY "Members can create event-team links" ON event_teams FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "Members can delete event-team links" ON event_teams FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );

-- Portfolio policies
DROP POLICY IF EXISTS "Members can create portfolio_projects" ON portfolio_projects;
DROP POLICY IF EXISTS "Members can delete portfolio_projects" ON portfolio_projects;
CREATE POLICY "Members can create portfolio_projects" ON portfolio_projects FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
    )
  );
CREATE POLICY "Members can delete portfolio_projects" ON portfolio_projects FOR DELETE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.team_id IN (SELECT user_team_ids(auth.uid()))
        AND user_team_role(auth.uid(), p.team_id) IN ('owner', 'admin', 'member')
    )
  );

-- Team invites
DROP POLICY IF EXISTS "Members can create team invites" ON team_invites;
DROP POLICY IF EXISTS "Members can revoke team invites" ON team_invites;
CREATE POLICY "Members can create team invites" ON team_invites FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
CREATE POLICY "Members can revoke team invites" ON team_invites FOR DELETE TO authenticated
  USING (
    team_id IN (SELECT user_team_ids(auth.uid()))
    AND user_team_role(auth.uid(), team_id) IN ('owner', 'admin', 'member')
  );
