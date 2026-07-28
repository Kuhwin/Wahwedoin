-- Migration 045: Fix remaining 1-arg user_team_role() callers
-- Migration 039 changed the user_team_role signature from (tid UUID) to
-- (uid UUID, tid UUID). A handful of policies in earlier migrations were
-- not rewritten and now reference the old 1-arg form, causing RLS to
-- fail. This migration rewrites them with the new 2-arg form.
-- (Note: project DELETE was already fixed in migration 042.)

-- team_members DELETE: allow self-leave or owner/admin to remove
DROP POLICY IF EXISTS "Owners remove members or self-leave" ON team_members;
CREATE POLICY "Owners remove members or self-leave"
  ON team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );

-- team_members UPDATE: only owners can change roles
DROP POLICY IF EXISTS "Owners update member roles" ON team_members;
CREATE POLICY "Owners update member roles"
  ON team_members FOR UPDATE TO authenticated
  USING (user_team_role(auth.uid(), team_id) = 'owner')
  WITH CHECK (user_team_role(auth.uid(), team_id) = 'owner');
