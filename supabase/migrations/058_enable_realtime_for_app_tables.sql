-- Migration 058: enable realtime for the app's tables
--
-- Background
-- ----------
-- Supabase's `supabase_realtime` publication controls which tables
-- emit postgres_changes events to subscribed clients. By default the
-- publication is empty (or only contains the realtime demo tables),
-- so subscribing to `postgres_changes` on an app table silently
-- receives nothing - no error, no events. That is why the
-- useRealtimeRefresh hook on the project page and the new realtime
-- subscription on the team Overview both registered a channel
-- successfully but never received a notification when a task was
-- created, updated, or deleted, and the stat counts on the Overview
-- only refreshed on a full page reload.
--
-- Fix
-- ---
-- Add the app's tables to the supabase_realtime publication and
-- set REPLICA IDENTITY FULL on the tables that receive UPDATE/DELETE
-- events (so the old row is included in the replication payload for
-- those operations; INSERT does not require it). DO blocks make the
-- statements idempotent and safe to re-run.

DO $$
BEGIN
  -- tasks
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
  ALTER TABLE public.tasks REPLICA IDENTITY FULL;

  -- projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
  END IF;
  ALTER TABLE public.projects REPLICA IDENTITY FULL;

  -- sections (Kanban columns)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sections;
  END IF;

  -- org_members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'org_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.org_members;
  END IF;

  -- team_members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;

  -- notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  -- activities
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
  END IF;
END $$;
