-- Durable text-planning results. AI assists never call a media provider and
-- are scoped to the current workspace so a stale tab cannot restore reset work.
create table public.creative_assists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  draft_key text,
  kind text not null check (kind in ('idea_suggestions', 'image_plan', 'video_clip_plan', 'video_plan', 'scene_revision')),
  input_snapshot jsonb not null default '{}'::jsonb,
  result jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  error jsonb,
  usage jsonb not null default '{}'::jsonb,
  model text,
  workspace_version integer not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index creative_assists_user_created_idx on public.creative_assists(created_by, created_at desc);
create index creative_assists_project_created_idx on public.creative_assists(project_id, created_at desc);

alter table public.creative_assists enable row level security;
revoke all on public.creative_assists from anon;
grant select, insert, update on public.creative_assists to authenticated;
grant all on public.creative_assists to service_role;

create policy "Collaborators read creative assists" on public.creative_assists for select to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Collaborators create own creative assists" on public.creative_assists for insert to authenticated
  with check (created_by = auth.uid() and project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Owners update own creative assists" on public.creative_assists for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

alter table public.video_plans
  add column if not exists creative_assist_id uuid references public.creative_assists(id) on delete set null,
  add column if not exists target_duration_seconds integer check (target_duration_seconds in (15, 30, 60));
alter table public.video_plan_scenes
  add column if not exists image_prompt text not null default '',
  add column if not exists motion_prompt text not null default '',
  add column if not exists locked_fields jsonb not null default '[]'::jsonb,
  add column if not exists source_mode text not null default 'manual' check (source_mode in ('manual', 'ai'));
