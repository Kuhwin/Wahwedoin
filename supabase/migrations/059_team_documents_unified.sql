-- Migration 059: team_documents (unified documents for a team)
--
-- Background
-- ----------
-- The team Docs tab should be a single, unified view of every
-- document relevant to the team, regardless of where it came from:
--   1. Internal team_docs created in-app (title/content/category).
--   2. The team's linked Google Drive folder (teams.drive_folder_id).
--   3. Drive folders linked to projects in the team
--      (projects.drive_folder_id).
--   4. Google Drive / Docs URLs pasted into task_comments on the
--      team's tasks (URL extraction).
--   5. Documents manually linked via a Drive picker.
--
-- Each row carries its context (team, optional project, optional
-- task, source, added_by, created_at) so permissions and grouping
-- stay correct. A document is "owned" by exactly one team; it is
-- never visible to a different team.
--
-- Fix
-- ---
-- Create the team_documents table as the unified store. RLS makes
-- rows visible only to members of the owning team. Dedupe is
-- handled by a partial unique index on (team_id, drive_file_id) for
-- Drive-sourced rows and (team_id, internal_doc_id) for internal
-- rows, so re-extracting the same Drive URL or re-syncing the same
-- internal doc never creates a duplicate. The table is added to the
-- supabase_realtime publication so the Docs list can live-update.

create type public.team_document_source as enum (
  'internal',
  'drive_folder_team',
  'drive_folder_project',
  'task_comment',
  'drive_picker'
);

create table if not exists public.team_documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  source public.team_document_source not null,
  -- Drive-sourced rows: the Google Drive file id. The folder it came
  -- from is implicit in the source ('drive_folder_team' uses teams'
  -- drive_folder_id, 'drive_folder_project' uses the project's
  -- drive_folder_id, 'drive_picker' / 'task_comment' use the file's
  -- own id without a folder link).
  drive_file_id text,
  -- Internal-sourced rows: link to the existing team_docs row.
  internal_doc_id uuid references public.team_docs(id) on delete cascade,
  -- Display fields. The Google Drive API is the source of truth for
  -- Drive-sourced rows, but we cache the basics so the list renders
  -- even when a user is not currently signed into Google.
  title text not null,
  mime_type text,
  web_view_link text,
  icon_link text,
  -- User-assignable category, matching the existing internal docs.
  category text not null default 'general'
    check (category in ('general','meeting_notes','sops','project_briefs')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_documents_team on public.team_documents(team_id);
create index if not exists idx_team_documents_project on public.team_documents(project_id);
create index if not exists idx_team_documents_task on public.team_documents(task_id);
create index if not exists idx_team_documents_drive_file on public.team_documents(drive_file_id);

-- Dedupe: one row per (team, drive_file) for Drive-sourced docs.
create unique index if not exists uq_team_documents_drive
  on public.team_documents (team_id, drive_file_id)
  where drive_file_id is not null;

-- Dedupe: one row per (team, internal_doc) for internal docs.
create unique index if not exists uq_team_documents_internal
  on public.team_documents (team_id, internal_doc_id)
  where internal_doc_id is not null;

-- RLS
alter table public.team_documents enable row level security;

-- Members of the team can read the team's documents.
drop policy if exists "team_documents_select" on public.team_documents;
create policy "team_documents_select" on public.team_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.team_members
      where team_members.team_id = team_documents.team_id
        and team_members.user_id = auth.uid()
    )
  );

-- Writes go through SECURITY DEFINER functions (or server actions)
-- so the application can insert with the correct added_by / context.
-- Allow inserts/updates/deletes by team owner or admin, or by the
-- row's added_by user.
drop policy if exists "team_documents_modify" on public.team_documents;
create policy "team_documents_modify" on public.team_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.team_members
      where team_members.team_id = team_documents.team_id
        and team_members.user_id = auth.uid()
        and team_members.role in ('owner','admin')
    )
    or added_by = auth.uid()
  )
  with check (
    exists (
      select 1 from public.team_members
      where team_members.team_id = team_documents.team_id
        and team_members.user_id = auth.uid()
        and team_members.role in ('owner','admin')
    )
    or added_by = auth.uid()
  );

-- Realtime: add the new table to the supabase_realtime publication
-- (idempotent) so the Docs list can live-update.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'team_documents'
  ) then
    alter publication supabase_realtime add table public.team_documents;
  end if;
  alter table public.team_documents replica identity full;
end $$;
