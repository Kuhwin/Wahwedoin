-- Migration 047: Cover photos for organizations and teams
-- Each org/team can have a logo/cover image stored in Supabase Storage.
-- Owners and admins can upload; everyone with access can view.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

-- =============================================
-- Storage buckets
-- =============================================
-- Two public buckets: org-covers and team-covers. Path convention:
--   {bucket}/{org_or_team_id}/{timestamp}-{filename}
-- RLS restricts uploads to owners/admins and deletes to owners/admins.
-- Anyone with team/org access can read (the bucket is public anyway).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-covers', 'org-covers', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team-covers', 'team-covers', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- Storage RLS
-- =============================================
-- We rely on a SECURITY DEFINER helper to check whether the caller is an
-- owner/admin of the given org/team. This avoids duplicating the role
-- lookup across many policies.

CREATE OR REPLACE FUNCTION user_org_role(p_org_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM org_members
   WHERE org_id = p_org_id AND user_id = p_uid
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION user_org_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_org_role(UUID, UUID) TO authenticated;

-- org-covers: path is "{org_id}/{filename}". Owners/admins can write
-- to their own org folder; anyone can read (bucket is public anyway).
DROP POLICY IF EXISTS "org-covers: owners/admins can upload" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-covers'
    AND user_org_role((string_to_array(name, '/'))[1]::UUID, auth.uid()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org-covers: owners/admins can update" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-covers'
    AND user_org_role((string_to_array(name, '/'))[1]::UUID, auth.uid()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org-covers: owners/admins can delete" ON storage.objects;
CREATE POLICY "org-covers: owners/admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-covers'
    AND user_org_role((string_to_array(name, '/'))[1]::UUID, auth.uid()) IN ('owner', 'admin')
  );

-- team-covers: path is "{team_id}/{filename}". Owners/admins of the
-- team can write; anyone can read.
DROP POLICY IF EXISTS "team-covers: owners/admins can upload" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), (string_to_array(name, '/'))[1]::UUID) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "team-covers: owners/admins can update" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), (string_to_array(name, '/'))[1]::UUID) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "team-covers: owners/admins can delete" ON storage.objects;
CREATE POLICY "team-covers: owners/admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-covers'
    AND user_team_role(auth.uid(), (string_to_array(name, '/'))[1]::UUID) IN ('owner', 'admin')
  );
