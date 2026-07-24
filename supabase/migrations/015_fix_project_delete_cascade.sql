-- Fix: add ON DELETE CASCADE to project_id FKs that are missing it
-- Without this, deleting a project fails because of orphaned rows

-- activities table
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_project_id_fkey;
ALTER TABLE activities ADD CONSTRAINT activities_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- events table
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_project_id_fkey;
ALTER TABLE events ADD CONSTRAINT events_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- team_docs table (if it has project_id without cascade)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%team_docs%project_id%fkey'
    AND table_name = 'team_docs'
  ) THEN
    ALTER TABLE team_docs DROP CONSTRAINT IF EXISTS team_docs_project_id_fkey;
    ALTER TABLE team_docs ADD CONSTRAINT team_docs_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;
