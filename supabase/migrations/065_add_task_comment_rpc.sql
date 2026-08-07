-- Migration 065: secure task comment creation
--
-- The client-side INSERT policy can reject valid comments when the task is
-- reached through a multi-homed project or when role policies differ between
-- environments. Keep RLS enabled and perform the same membership check in a
-- SECURITY DEFINER function instead.

CREATE OR REPLACE FUNCTION add_task_comment(
  p_task_id UUID,
  p_body TEXT,
  p_parent_id UUID DEFAULT NULL
)
RETURNS task_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_comment task_comments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN team_members tm ON tm.team_id = p.team_id
    WHERE t.id = p_task_id
      AND tm.user_id = v_uid
      AND tm.role IN ('owner', 'admin', 'member')
  ) AND NOT EXISTS (
    SELECT 1
    FROM task_projects tp
    JOIN projects p ON p.id = tp.project_id
    JOIN team_members tm ON tm.team_id = p.team_id
    WHERE tp.task_id = p_task_id
      AND tm.user_id = v_uid
      AND tm.role IN ('owner', 'admin', 'member')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to comment on this task';
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_comments
    WHERE id = p_parent_id AND task_id = p_task_id
  ) THEN
    RAISE EXCEPTION 'Reply target does not belong to this task';
  END IF;

  INSERT INTO task_comments (task_id, user_id, body, parent_id)
  VALUES (p_task_id, v_uid, btrim(p_body), p_parent_id)
  RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_task_comment(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_task_comment(UUID, TEXT, UUID) TO authenticated;
