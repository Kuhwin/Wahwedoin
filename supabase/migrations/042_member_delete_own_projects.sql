-- Migration 042: Allow project creators to delete their own team projects
-- Previously only owners/admins could delete projects. Members should be able
-- to delete projects they created themselves. The `created_by` column on
-- `projects` records the original creator regardless of their team role.

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'projects' AND schemaname = 'public'
    AND policyname LIKE '%delete%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON projects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Owners, admins, and creators can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (
    (team_id IS NULL AND created_by = auth.uid())
    OR created_by = auth.uid()
    OR user_team_role(auth.uid(), team_id) IN ('owner', 'admin')
  );
