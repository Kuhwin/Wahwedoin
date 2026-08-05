-- Migration 060: team_documents sync RPC
--
-- Background
-- ----------
-- The team Docs tab reads from the unified team_documents table, whose
-- rows come from several sources. The client can fetch a user's own
-- Google Drive listing (per-user OAuth token), but inserting/updating
-- team_documents rows is restricted by RLS: only the team owner/admin
-- or the row's added_by user may write. A regular team member who
-- triggers a sync could not otherwise create rows for files owned by
-- another member, nor update rows created by an admin.
--
-- Fix
-- ---
-- Add a SECURITY DEFINER RPC `sync_team_documents(team_id, rows)` that:
--   1. Requires the caller to be a member of the team.
--   2. Mirrors internal team_docs rows into team_documents (source
--      'internal'), mapping team_docs' category values (sop, project_brief)
--      onto the unified table's values (sops, project_briefs). The FK
--      internal_doc_id -> team_docs on delete cascade keeps this in sync
--      when a doc is deleted.
--   3. Upserts the client-provided Drive rows (drive_folder_team,
--      drive_folder_project, and, in later phases, task_comment and
--      drive_picker). Display fields are refreshed; category and context
--      (project/task/source) are preserved on conflict so a user's
--      recategorization and the first-observed context win.
--   4. Deletes stale drive_folder_* rows whose file no longer appears in
--      any linked folder (folder unlinked or file removed). Task-comment
--      and picker rows are never removed by the sync.
--   5. Deletes internal mirrors whose source team_docs row no longer
--      exists (belt-and-braces on top of the FK cascade).

create or replace function public.sync_team_documents(
  p_team_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_source public.team_document_source;
begin
  if not exists (
    select 1 from public.team_members
    where team_members.team_id = p_team_id
      and team_members.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this team';
  end if;

  -- 2. Mirror internal docs.
  insert into public.team_documents (
    team_id, source, internal_doc_id, title, category, added_by
  )
  select
    d.team_id,
    'internal'::public.team_document_source,
    d.id,
    d.title,
    case d.category
      when 'sop' then 'sops'
      when 'project_brief' then 'project_briefs'
      else d.category
    end,
    d.created_by
  from public.team_docs d
  where d.team_id = p_team_id
  on conflict (team_id, internal_doc_id) where internal_doc_id is not null
  do update set
    title = excluded.title,
    category = excluded.category;

  -- 3. Upsert client-provided rows.
  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_source := (r->>'source')::public.team_document_source;
    if v_source is null then
      continue;
    end if;

    if v_source = 'internal' then
      insert into public.team_documents (
        team_id, project_id, task_id, source, drive_file_id, internal_doc_id,
        title, mime_type, web_view_link, icon_link, category, added_by
      )
      values (
        p_team_id,
        (r->>'project_id')::uuid,
        (r->>'task_id')::uuid,
        v_source,
        r->>'drive_file_id',
        (r->>'internal_doc_id')::uuid,
        r->>'title',
        r->>'mime_type',
        r->>'web_view_link',
        r->>'icon_link',
        coalesce(r->>'category', 'general'),
        auth.uid()
      )
      on conflict (team_id, internal_doc_id) where internal_doc_id is not null
      do update set
        title = excluded.title,
        mime_type = excluded.mime_type,
        web_view_link = excluded.web_view_link,
        icon_link = excluded.icon_link;
    else
      insert into public.team_documents (
        team_id, project_id, task_id, source, drive_file_id, internal_doc_id,
        title, mime_type, web_view_link, icon_link, category, added_by
      )
      values (
        p_team_id,
        (r->>'project_id')::uuid,
        (r->>'task_id')::uuid,
        v_source,
        r->>'drive_file_id',
        (r->>'internal_doc_id')::uuid,
        r->>'title',
        r->>'mime_type',
        r->>'web_view_link',
        r->>'icon_link',
        coalesce(r->>'category', 'general'),
        auth.uid()
      )
      on conflict (team_id, drive_file_id) where drive_file_id is not null
      do update set
        title = excluded.title,
        mime_type = excluded.mime_type,
        web_view_link = excluded.web_view_link,
        icon_link = excluded.icon_link;
    end if;
  end loop;

  -- 4. Remove drive_folder rows whose file is no longer in a linked folder.
  delete from public.team_documents td
  where td.team_id = p_team_id
    and td.source in (
      'drive_folder_team'::public.team_document_source,
      'drive_folder_project'::public.team_document_source
    )
    and not exists (
      select 1 from jsonb_array_elements(p_rows) x
      where (x->>'source') in ('drive_folder_team', 'drive_folder_project')
        and (x->>'source')::public.team_document_source = td.source
        and (x->>'drive_file_id') = td.drive_file_id
    );

  -- 5. Remove internal mirrors whose source doc no longer exists.
  delete from public.team_documents td
  where td.team_id = p_team_id
    and td.source = 'internal'::public.team_document_source
    and not exists (
      select 1 from public.team_docs d
      where d.id = td.internal_doc_id
    );
end;
$$;

revoke execute on function public.sync_team_documents(uuid, jsonb) from public;
grant execute on function public.sync_team_documents(uuid, jsonb) to authenticated;
