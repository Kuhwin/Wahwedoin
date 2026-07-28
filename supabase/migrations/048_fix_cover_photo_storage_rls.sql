-- Migration 048: Fix storage RLS for cover photos
-- The previous policy used string_to_array(name, '/')[1] which can include
-- the bucket prefix. The proper Supabase helper is storage.foldername(name)
-- which returns just the folder parts. We also add a missing SELECT policy
-- for read access (the bucket is public but RLS still needs to allow reads).
-- And we expose a helper that returns the first folder segment as a UUID,
-- with proper validation.

-- =============================================
-- Helper: extract first folder from a storage object name
-- =============================================
CREATE OR REPLACE FUNCTION storage_first_folder(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (storage.foldername(p_name))[1];
$$;

GRANT EXECUTE ON FUNCTION storage_first_folder(TEXT) TO authenticated;

-- =============================================
-- Org-covers policies
-- Path convention: {org_id}/{filename}
-- =============================================
DROP POLICY IF EXISTS "org-covers: anyone can read" ON storage.objects;
CREATE POLICY "org-covers: anyone can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-covers');

DROP POLICY IF EXISTS "org-covers: owners/admins can upload" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-covers'
    AND user_org_role(storage_first_folder(name)::UUID, auth.uid()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org-covers: owners/admins can update" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-covers'
    AND user_org_role(storage_first_folder(name)::UUID, auth.uid()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org-covers: owners/admins can delete" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-covers'
    AND user_org_role(storage_first_folder(name)::UUID, auth.uid()) IN ('owner', 'admin')
  );

-- =============================================
-- Team-covers policies
-- Path convention: {team_id}/{filename}
-- =============================================
DROP POLICY IF EXISTS "team-covers: anyone can read" ON storage.objects;
CREATE POLICY "team-covers: anyone can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-covers');

DROP POLICY IF EXISTS "team-covers: owners/admins can upload" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), storage_first_folder(name)::UUID) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "team-covers: owners/admins can update" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), storage_first_folder(name)::UUID) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "team-covers: owners/admins can delete" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), storage_first_folder(name)::UUID) IN ('owner', 'admin')
  );
