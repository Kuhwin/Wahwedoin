-- =============================================
-- Migration 062: Full account deletion
-- =============================================
-- Lets a user permanently delete their own account. Run from the app via
-- POST /api/account/delete which calls delete_own_account().
--
-- What it does, in order:
--   1. Deletes teams the user is the sole member of (activities reference
--      teams with a RESTRICT FK, so they are cleared first — same pattern as
--      delete_org — and parent_team_id self-references are detached).
--   2. Deletes organizations the user is the sole member of (teams inside
--      cascade via teams.org_id; activities for those teams are cleared).
--   3. For remaining teams/orgs where the user is the ONLY owner and there
--      are other members, promotes the longest-standing other member to
--      owner so the team/org is not left ownerless.
--   4. Nulls out authorship/assignment FKs (RESTRICT) so shared content
--      survives and does not block the auth.users delete.
--   5. Removes personal rows (profiles, prefs, linked Google accounts,
--      saved views, personal tags, notifications, memberships...).
--   6. Deletes the auth.users row; cascades clean up sessions, identities,
--      and refresh tokens, plus any remaining ON DELETE CASCADE rows.
--
-- The org_members owner-guard triggers (trg_prevent_remove_last_owner /
-- trg_prevent_demote_last_owner) are disabled for the duration of the
-- function so that sole-member organizations can be removed. DDL is
-- transactional in Postgres, so if anything fails the whole function rolls
-- back — including the trigger changes.

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team_ids uuid[];
  v_org_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  ALTER TABLE public.org_members DISABLE TRIGGER trg_prevent_remove_last_owner;
  ALTER TABLE public.org_members DISABLE TRIGGER trg_prevent_demote_last_owner;

  -- 1. Teams the user is the sole member of: delete entirely.
  SELECT ARRAY(
    SELECT tm.team_id
    FROM team_members tm
    WHERE tm.user_id = v_uid
      AND (SELECT COUNT(*) FROM team_members m2 WHERE m2.team_id = tm.team_id) = 1
  ) INTO v_team_ids;

  IF array_length(v_team_ids, 1) > 0 THEN
    DELETE FROM activities WHERE team_id = ANY(v_team_ids);
    UPDATE teams SET parent_team_id = NULL WHERE parent_team_id = ANY(v_team_ids);
    DELETE FROM teams WHERE id = ANY(v_team_ids);
  END IF;

  -- 2. Organizations the user is the sole member of: delete entirely.
  SELECT ARRAY(
    SELECT om.org_id
    FROM org_members om
    WHERE om.user_id = v_uid
      AND (SELECT COUNT(*) FROM org_members o2 WHERE o2.org_id = om.org_id) = 1
  ) INTO v_org_ids;

  IF array_length(v_org_ids, 1) > 0 THEN
    DELETE FROM activities
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = ANY(v_org_ids));
    UPDATE teams SET parent_team_id = NULL WHERE org_id = ANY(v_org_ids);
    DELETE FROM organizations WHERE id = ANY(v_org_ids);
  END IF;

  -- 3. For remaining teams where the user is the only owner, promote the
  --    longest-standing other member so the team is not left ownerless.
  UPDATE team_members tm
  SET role = 'owner'
  WHERE tm.team_id IN (
      SELECT t.team_id FROM team_members t
      WHERE t.user_id = v_uid AND t.role = 'owner'
        AND (SELECT COUNT(*) FROM team_members m2 WHERE m2.team_id = t.team_id) > 1
        AND (SELECT COUNT(*) FROM team_members m3 WHERE m3.team_id = t.team_id AND m3.role = 'owner') = 1
    )
    AND tm.id = (
      SELECT m4.id FROM team_members m4
      WHERE m4.team_id = tm.team_id AND m4.user_id <> v_uid
      ORDER BY m4.joined_at ASC NULLS LAST, m4.id ASC
      LIMIT 1
    );

  -- Same for organizations.
  UPDATE org_members om
  SET role = 'owner'
  WHERE om.org_id IN (
      SELECT o.org_id FROM org_members o
      WHERE o.user_id = v_uid AND o.role = 'owner'
        AND (SELECT COUNT(*) FROM org_members o2 WHERE o2.org_id = o.org_id) > 1
        AND (SELECT COUNT(*) FROM org_members o3 WHERE o3.org_id = o.org_id AND o3.role = 'owner') = 1
    )
    AND om.id = (
      SELECT o4.id FROM org_members o4
      WHERE o4.org_id = om.org_id AND o4.user_id <> v_uid
      ORDER BY o4.joined_at ASC NULLS LAST, o4.id ASC
      LIMIT 1
    );

  -- 4. Detach authorship/assignment FKs (RESTRICT) so shared content
  --    survives and does not block the auth.users delete. goals, team_meetings,
  --    team_docs and team_documents already use ON DELETE SET NULL.
  UPDATE tasks SET assignee_id = NULL WHERE assignee_id = v_uid;
  UPDATE tasks SET created_by = NULL WHERE created_by = v_uid;
  UPDATE projects SET created_by = NULL WHERE created_by = v_uid;
  UPDATE events SET created_by = NULL WHERE created_by = v_uid;
  UPDATE task_comments SET user_id = NULL WHERE user_id = v_uid;
  UPDATE activities SET user_id = NULL WHERE user_id = v_uid;
  UPDATE team_invites SET invited_by = NULL WHERE invited_by = v_uid;
  UPDATE task_attachments SET user_id = NULL WHERE user_id = v_uid;
  UPDATE portfolios SET created_by = NULL WHERE created_by = v_uid;

  -- 5. Remove personal rows explicitly (cascades from auth.users would also
  --    catch most of these, but be explicit and independent of FK wiring).
  DELETE FROM task_followers WHERE user_id = v_uid;
  DELETE FROM task_assignees WHERE user_id = v_uid;
  DELETE FROM notifications WHERE user_id = v_uid;
  DELETE FROM notification_preferences WHERE user_id = v_uid;
  DELETE FROM user_google_accounts WHERE user_id = v_uid;
  DELETE FROM calendar_links WHERE user_id = v_uid;
  DELETE FROM saved_views WHERE user_id = v_uid;
  DELETE FROM tags WHERE user_id = v_uid;
  DELETE FROM org_members WHERE user_id = v_uid;
  DELETE FROM team_members WHERE user_id = v_uid;
  DELETE FROM user_profiles WHERE user_id = v_uid;

  -- 6. Delete the auth user; cascades remove sessions/identities/tokens.
  DELETE FROM auth.users WHERE id = v_uid;

  ALTER TABLE public.org_members ENABLE TRIGGER trg_prevent_remove_last_owner;
  ALTER TABLE public.org_members ENABLE TRIGGER trg_prevent_demote_last_owner;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
