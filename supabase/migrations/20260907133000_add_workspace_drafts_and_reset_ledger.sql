-- Durable tool drafts and a reset ledger.  The ledger intentionally contains
-- no public policy: backup manifests and copied media are operator-only.

alter table public.projects
  add column if not exists workspace_version integer not null default 1 check (workspace_version > 0),
  add column if not exists workspace_reset_at timestamptz;

create table if not exists public.workspace_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tool text not null check (tool in ('image', 'video')),
  version integer not null default 1 check (version > 0),
  payload jsonb not null default '{}'::jsonb,
  content_set_id uuid references public.content_sets(id) on delete set null,
  content_output_id uuid references public.content_outputs(id) on delete set null,
  workspace_version integer not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_drafts_project_tool_updated
  on public.workspace_drafts(project_id, tool, updated_at desc);

create table if not exists private.workspace_reset_backups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  workspace_version_before integer not null,
  status text not null default 'prepared' check (status in ('prepared', 'verified', 'executed', 'expired', 'failed')),
  manifest jsonb not null default '{}'::jsonb,
  manifest_sha256 text not null,
  storage_prefix text not null,
  object_count integer not null default 0 check (object_count >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists idx_workspace_reset_backups_project_created
  on private.workspace_reset_backups(project_id, created_at desc);

alter table public.workspace_drafts enable row level security;

create policy "Project collaborators can read workspace drafts"
  on public.workspace_drafts for select to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Project collaborators can create their workspace drafts"
  on public.workspace_drafts for insert to authenticated
  with check (created_by = auth.uid() and project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Draft creators can update their workspace drafts"
  on public.workspace_drafts for update to authenticated
  using (created_by = auth.uid() and project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()))
  with check (created_by = auth.uid());
create policy "Draft creators can delete their workspace drafts"
  on public.workspace_drafts for delete to authenticated
  using (created_by = auth.uid());

grant select, insert, update, delete on public.workspace_drafts to authenticated;
grant all on public.workspace_drafts to service_role;

drop trigger if exists workspace_drafts_updated_at on public.workspace_drafts;
create trigger workspace_drafts_updated_at before update on public.workspace_drafts
  for each row execute function public.set_content_updated_at();

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-reset-backups', 'workspace-reset-backups', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

revoke all on private.workspace_reset_backups from anon, authenticated;
grant all on private.workspace_reset_backups to service_role;
