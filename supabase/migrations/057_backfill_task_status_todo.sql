-- Migration 057: backfill tasks with NULL or invalid status to 'todo'
--
-- Background
-- ----------
-- The status column on tasks has a default of 'todo' (migration 001),
-- but a small number of existing rows were inserted with a NULL
-- status (e.g. inserts that omitted the column before the default
-- was reliably applied, or rows that were created via a flow that
-- passed status = null explicitly). Those tasks do not match any of
-- the three allowed values ('todo', 'in_progress', 'done'), so the
-- project page's status filter ('All', 'To do', 'In progress',
-- 'Done') never shows them and the user perceives them as
-- "missing" tasks.
--
-- The application code now always sets status = 'todo' explicitly
-- when creating a task without a status chosen (so new tasks are
-- correct), but the existing NULL-status rows need a one-time data
-- backfill.
--
-- Fix
-- ---
-- Update every task whose status is NULL, empty, or any value
-- outside the allowed set, to 'todo'. The CHECK constraint on
-- the column permits 'todo', so the UPDATE is valid.

UPDATE tasks
   SET status = 'todo'
 WHERE status IS NULL
    OR status = ''
    OR status NOT IN ('todo', 'in_progress', 'done');
