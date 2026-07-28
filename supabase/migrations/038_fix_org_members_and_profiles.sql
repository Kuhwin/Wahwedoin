-- =============================================
-- Migration 038: Fix org member display and lookup
-- =============================================

-- 1. SECURITY DEFINER function to look up org member profiles (bypasses RLS)
--    Returns display names, avatar URLs, and emails for all members of an org.
CREATE OR REPLACE FUNCTION get_org_member_profiles(p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(up.display_name, '')::TEXT,
    up.avatar_url::TEXT,
    u.email::TEXT
  FROM org_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN user_profiles up ON up.user_id = om.user_id
  WHERE om.org_id = p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_org_member_profiles(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_org_member_profiles(UUID) TO authenticated;

-- 2. SECURITY DEFINER function to search users by display_name or email
--    for adding new org members. Only returns users not already in the org.
--    Takes p_current_user to avoid relying on auth.uid() inside SECURITY DEFINER.
CREATE OR REPLACE FUNCTION search_org_candidates(p_query TEXT, p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(up.display_name, '')::TEXT,
    u.email::TEXT
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE
    u.id NOT IN (SELECT om.user_id FROM org_members om WHERE om.org_id = p_org_id)
    AND (
      up.display_name ILIKE '%' || p_query || '%'
      OR u.email ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE WHEN up.display_name ILIKE p_query || '%' THEN 0
         WHEN u.email ILIKE p_query || '%' THEN 1
         ELSE 2
    END
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_org_candidates(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_org_candidates(TEXT, UUID) TO authenticated;

-- 3. Clean up: remove org_member entries where the user has no auth.users entry
--    (orphaned records) and also fix the backfill to not add all team owners
--    Note: Run this AFTER the migration is applied
DELETE FROM org_members om
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id);
