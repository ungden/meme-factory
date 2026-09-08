-- Multi-scene video is intentionally separate from the legacy single-clip
-- ContentOutput flow. A plan freezes the cast and the input frame used for
-- each scene; a batch only records an approved selection of plans.
create table public.video_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content_set_id uuid references public.content_sets(id) on delete set null,
  title text not null default 'Video nhiều cảnh',
  brief text not null default '',
  format text not null default '9:16' check (format in ('1:1', '4:5', '9:16', '16:9')),
  resolution text not null default '720p' check (resolution in ('720p', '1080p')),
  generate_audio boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'quoted', 'running', 'completed', 'failed', 'cancelled', 'approved')),
  version integer not null default 1 check (version > 0),
  cast_snapshot jsonb not null default '[]'::jsonb,
  quote_snapshot jsonb,
  quote_expires_at timestamptz,
  latest_content_output_id uuid references public.content_outputs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_plan_scenes (
  id uuid primary key default gen_random_uuid(),
  video_plan_id uuid not null references public.video_plans(id) on delete cascade,
  scene_index integer not null check (scene_index >= 0),
  version integer not null default 1 check (version > 0),
  cast_snapshot jsonb not null default '[]'::jsonb,
  speaker_character_id uuid references public.characters(id) on delete set null,
  dialogue text not null default '',
  action text not null default '',
  setting text not null default '',
  prompt text not null default '',
  duration_seconds integer not null default 5 check (duration_seconds in (4, 5, 6, 7, 8, 9, 10, 15, 30)),
  start_image_url text,
  end_image_url text,
  follows_previous boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'quoted', 'queued', 'running', 'completed', 'failed', 'needs_review', 'cancelled')),
  active_job_id uuid references public.generation_jobs(id) on delete set null,
  clip_url text,
  clip_duration_seconds integer,
  transcript text,
  speech_qa jsonb not null default '{}'::jsonb,
  quote_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_plan_id, scene_index)
);

create table public.video_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Lô video',
  status text not null default 'draft' check (status in ('draft', 'quoted', 'running', 'completed', 'partial', 'cancelled', 'failed')),
  version integer not null default 1 check (version > 0),
  quote_snapshot jsonb,
  quote_expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_batch_items (
  id uuid primary key default gen_random_uuid(),
  video_batch_id uuid not null references public.video_batches(id) on delete cascade,
  video_plan_id uuid not null references public.video_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  selected boolean not null default true,
  quote_snapshot jsonb,
  status text not null default 'draft' check (status in ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique(video_batch_id, video_plan_id)
);

alter table public.generation_jobs
  add column if not exists video_plan_id uuid references public.video_plans(id) on delete set null,
  add column if not exists video_plan_scene_id uuid references public.video_plan_scenes(id) on delete set null,
  add column if not exists parent_job_id uuid references public.generation_jobs(id) on delete set null,
  add column if not exists lease_owner uuid,
  add column if not exists attempt integer not null default 1 check (attempt > 0),
  add column if not exists phase text;

alter table public.content_outputs drop constraint if exists content_outputs_duration_seconds_check;
alter table public.content_outputs add constraint content_outputs_duration_seconds_check
  check (duration_seconds is null or duration_seconds between 4 and 300);

update storage.buckets
set allowed_mime_types = array['video/mp4', 'image/jpeg', 'image/png', 'image/webp']
where id = 'content-media';

alter table public.generation_jobs drop constraint if exists generation_jobs_creation_kind_check;
alter table public.generation_jobs add constraint generation_jobs_creation_kind_check check (creation_kind in (
  'meme', 'fashion_shot', 'storyboard_shot', 'character_reference', 'background',
  'content_image', 'content_video', 'video_scene', 'video_plan_render'
));

create index idx_video_plans_project_updated on public.video_plans(project_id, updated_at desc);
create index idx_video_plan_scenes_plan_order on public.video_plan_scenes(video_plan_id, scene_index);
create index idx_video_batches_project_updated on public.video_batches(project_id, updated_at desc);
create index idx_generation_jobs_video_scene_active on public.generation_jobs(video_plan_scene_id, created_at desc)
  where video_plan_scene_id is not null;
create index idx_generation_jobs_render_queue on public.generation_jobs(status, lease_expires_at, created_at)
  where creation_kind = 'video_plan_render' and status in ('queued', 'running');

create or replace function public.set_multiscene_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger video_plans_updated_at before update on public.video_plans
  for each row execute function public.set_multiscene_updated_at();
create trigger video_plan_scenes_updated_at before update on public.video_plan_scenes
  for each row execute function public.set_multiscene_updated_at();
create trigger video_batches_updated_at before update on public.video_batches
  for each row execute function public.set_multiscene_updated_at();

-- The ordinary API uses RLS; rendering uses the service role. Every policy
-- scopes through the plan/batch project, so a collaborator cannot enumerate a
-- different project's scripts, clips, price snapshots, or transcripts.
alter table public.video_plans enable row level security;
alter table public.video_plan_scenes enable row level security;
alter table public.video_batches enable row level security;
alter table public.video_batch_items enable row level security;
revoke all on table public.video_plans, public.video_plan_scenes, public.video_batches, public.video_batch_items from anon;
grant select, insert, update, delete on table public.video_plans, public.video_plan_scenes, public.video_batches, public.video_batch_items to authenticated;

create policy "Collaborators manage video plans" on public.video_plans for all to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()))
  with check (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Collaborators manage video scenes" on public.video_plan_scenes for all to authenticated
  using (video_plan_id in (select vp.id from public.video_plans vp where vp.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())))
  with check (video_plan_id in (select vp.id from public.video_plans vp where vp.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));
create policy "Collaborators manage video batches" on public.video_batches for all to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()))
  with check (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
create policy "Collaborators manage batch items" on public.video_batch_items for all to authenticated
  using (video_batch_id in (select vb.id from public.video_batches vb where vb.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())))
  with check (video_batch_id in (select vb.id from public.video_batches vb where vb.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));

grant all on table public.video_plans, public.video_plan_scenes, public.video_batches, public.video_batch_items to service_role;

-- Claiming assigns an ownership token as well as an expiry. The worker must
-- prove that token on heartbeat/finalize so a stale worker cannot overwrite a
-- scene reclaimed by another worker.
drop function if exists public.claim_wavespeed_video_jobs(integer, integer);
create function public.claim_wavespeed_video_jobs(
  _batch_size integer default 2,
  _lease_seconds integer default 90
)
returns table (
  id uuid, project_id uuid, content_output_id uuid, video_plan_id uuid,
  video_plan_scene_id uuid, provider_request_id text, requested_output jsonb,
  lease_owner uuid
)
language plpgsql security definer set search_path = public as $$
begin
  if _batch_size < 1 or _batch_size > 8 or _lease_seconds < 30 or _lease_seconds > 600 then
    raise exception 'Invalid WaveSpeed claim parameters';
  end if;
  return query
  with candidates as (
    select gj.id from public.generation_jobs gj
    where gj.provider = 'wavespeed' and gj.status = 'running' and gj.provider_request_id is not null
      and (gj.lease_expires_at is null or gj.lease_expires_at <= now())
    order by gj.started_at asc nulls last, gj.created_at asc
    limit _batch_size for update skip locked
  )
  update public.generation_jobs gj
    set lease_expires_at = now() + make_interval(secs => _lease_seconds),
        lease_owner = gen_random_uuid(),
        checkpoint = coalesce(gj.checkpoint, '{}'::jsonb) || jsonb_build_object('worker_claimed_at', now())
  from candidates where gj.id = candidates.id
  returning gj.id, gj.project_id, gj.content_output_id, gj.video_plan_id, gj.video_plan_scene_id,
    gj.provider_request_id, gj.requested_output, gj.lease_owner;
end;
$$;

create function public.claim_video_plan_render_jobs(
  _batch_size integer default 1,
  _lease_seconds integer default 90
)
returns table (id uuid, project_id uuid, content_output_id uuid, video_plan_id uuid, requested_output jsonb, lease_owner uuid)
language plpgsql security definer set search_path = public as $$
begin
  if _batch_size < 1 or _batch_size > 2 or _lease_seconds < 30 or _lease_seconds > 600 then
    raise exception 'Invalid render claim parameters';
  end if;
  return query
  with candidates as (
    select gj.id from public.generation_jobs gj
    where gj.creation_kind = 'video_plan_render' and gj.status = 'queued'
      and (gj.lease_expires_at is null or gj.lease_expires_at <= now())
      and not exists (
        select 1 from public.video_plan_scenes vps
        where vps.video_plan_id = gj.video_plan_id
          and vps.id = any(array(select jsonb_array_elements_text(coalesce(gj.requested_output->'sceneIds', '[]'::jsonb))::uuid))
          and vps.status <> 'completed'
      )
    order by gj.created_at limit _batch_size for update skip locked
  )
  update public.generation_jobs gj
    set status = 'running', started_at = coalesce(gj.started_at, now()),
        lease_expires_at = now() + make_interval(secs => _lease_seconds), lease_owner = gen_random_uuid(),
        checkpoint = coalesce(gj.checkpoint, '{}'::jsonb) || jsonb_build_object('render_claimed_at', now())
  from candidates where gj.id = candidates.id
  returning gj.id, gj.project_id, gj.content_output_id, gj.video_plan_id, gj.requested_output, gj.lease_owner;
end;
$$;

revoke all on function public.claim_wavespeed_video_jobs(integer, integer) from public;
revoke all on function public.claim_video_plan_render_jobs(integer, integer) from public;
