-- Migration 057: fix user_profiles visibility and auto-create rows for new users
--
-- Background
-- ----------
-- Migration 004 (user_profiles.sql) set up user_profiles with a RLS policy
-- that only lets a user see their own row:
--
--   CREATE POLICY "Users can view own profile"
--     ON user_profiles FOR SELECT TO authenticated
--     USING (user_id = auth.uid());
--
-- Many client components (the team modal in manage/page.tsx, the team
-- dashboard in teams/[teamId]/page.tsx, TeamOverview, the project page,
-- task assignees, the activity feed, etc.) read profiles for other users
-- with a direct query like:
--
--   .from("user_profiles").select(...).in("user_id", userIds)
--
-- Because of the policy above, those queries silently return only the
-- caller's own row, so every other member's display_name and avatar_url
-- come back undefined. The call sites fall back to passing the raw UUID
-- as the name and as the Avatar's email prop, which the <Avatar>
-- component then turns into a two-character initial ("A5", "C6", ...).
-- That is how users without a visible profile appear in the UI.
--
-- Additionally, there is no auth.users insert trigger, so any user
-- created via the Supabase auth API (invitees, OAuth, etc.) has no
-- row in user_profiles at all, which is what causes the "no row ->
-- undefined -> UUID" path in the first place.
--
-- Fix
-- ---
-- 1. Add a permissive SELECT policy that lets an authenticated user read
--    the profile of any other user they share an organization with.
--    Combined with the existing "own profile" policy, this is a strict
--    superset (own profile, plus shared-org peers). Multiple permissive
--    SELECT policies are OR'd, so the existing own-profile policy can
--    remain; the new one covers the shared-org case and fixes every
--    affected component in one place.
-- 2. Add a handle_new_user trigger on auth.users that creates an empty
--    user_profiles row for every new signup. This guarantees the row
--    exists from the start; the existing Name Entry Modal in
--    src/app/(dashboard)/layout.tsx still fires when display_name is
--    empty, so the user-facing UX is unchanged.
--
-- Idempotent.

-- 1. Shared-org SELECT policy for user_profiles.
DROP POLICY IF EXISTS "Users can view profiles of people in their orgs" ON user_profiles;
CREATE POLICY "Users can view profiles of people in their orgs"
  ON user_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM org_members om_viewer
        JOIN org_members om_target
          ON om_target.org_id = om_viewer.org_id
       WHERE om_viewer.user_id = auth.uid()
         AND om_target.user_id = user_profiles.user_id
    )
  );

-- 2. Auto-create a user_profiles row for every new auth.users insert so
-- the row is guaranteed to exist; display_name starts empty and is filled
-- in by the Name Entry Modal (layout.tsx) or Settings page.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (NEW.id, '')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
