alter table public.teams
  add column if not exists drive_account_id uuid references public.user_google_accounts(id) on delete set null,
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_name text;

create index if not exists idx_teams_drive_folder on public.teams(drive_account_id);
