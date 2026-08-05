-- Migration 061: sync_team_documents cleanup hardening
--
-- Background
-- ----------
-- The initial sync_team_documents RPC (060) always cleaned up
-- drive_folder_team / drive_folder_project rows that were not present in
-- the caller's row set. That is destructive when a caller syncs a
-- different source:
--   * syncTaskCommentDocs passes only task_comment rows -> running the
--     cleanup would delete every Drive-folder doc.
--   * A folder fetch can silently return an empty list when the OAuth
--     token is expired/unrefreshed -> the cleanup would delete every doc
--     in that folder.
--
-- Fix
-- ---
-- Redefine the function with a p_cleanup flag (default true). The
-- Drive-folder cleanup now runs only when BOTH the caller asked for
-- cleanup AND this call actually manages Drive-folder sources (at least
-- one drive_folder_* row was provided). Callers syncing task comments or
-- Drive-picker rows pass p_cleanup = false; the folder sync passes
-- p_cleanup = false when any folder fetch failed. The internal mirror
-- cleanup is independent of the Drive rows and stays unconditional.

drop function if exists public.sync_team_documents(uuid, jsonb);

create or replace function public.sync_team_documents(
  p_team_id uuid,
  p_rows jsonb,
  p_cleanup boolean default true
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

  -- Mirror internal docs.
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

  -- Upsert client-provided rows.
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

  -- Remove drive_folder rows whose file is no longer in a linked folder,
  -- but only when this call manages Drive-folder sources and the caller
  -- asked for cleanup (a failed/expired-token fetch must never wipe them).
  if p_cleanup and exists (
    select 1 from jsonb_array_elements(p_rows) x
    where (x->>'source') in ('drive_folder_team', 'drive_folder_project')
  ) then
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
  end if;

  -- Remove internal mirrors whose source doc no longer exists.
  delete from public.team_documents td
  where td.team_id = p_team_id
    and td.source = 'internal'::public.team_document_source
    and not exists (
      select 1 from public.team_docs d
      where d.id = td.internal_doc_id
    );
end;
$$;

revoke execute on function public.sync_team_documents(uuid, jsonb, boolean) from public;
grant execute on function public.sync_team_documents(uuid, jsonb, boolean) to authenticated;
