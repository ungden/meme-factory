-- A content set is the durable brief that connects copy, stills and video.
-- It is deliberately additive: existing memes and image generation jobs remain
-- readable while new work has a single project-scoped source of truth.
alter table public.projects
  add column if not exists brand_voice text,
  add column if not exists audience text,
  add column if not exists content_guidelines text;

create table if not exists public.content_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  brief text not null default '',
  selected_character_ids uuid[] not null default '{}',
  brand_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_outputs (
  id uuid primary key default gen_random_uuid(),
  content_set_id uuid not null references public.content_sets(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  kind text not null check (kind in ('image', 'video')),
  format text not null check (format in ('1:1', '4:5', '9:16', '16:9')),
  caption text,
  script text,
  media_url text,
  poster_url text,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 4 and 30),
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'running', 'completed', 'failed', 'approved', 'rejected')),
  review_version integer not null default 1,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_output_reviews (
  id uuid primary key default gen_random_uuid(),
  content_output_id uuid not null references public.content_outputs(id) on delete cascade,
  status text not null check (status in ('approved', 'rejected')),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  note text,
  version integer not null,
  created_at timestamptz not null default now()
);

alter table public.generation_jobs
  drop constraint if exists generation_jobs_creation_kind_check;
alter table public.generation_jobs
  add constraint generation_jobs_creation_kind_check check (creation_kind in (
    'meme', 'fashion_shot', 'storyboard_shot', 'character_reference', 'background', 'content_image', 'content_video'
  ));
alter table public.generation_jobs
  drop constraint if exists generation_jobs_provider_check;
alter table public.generation_jobs
  add constraint generation_jobs_provider_check check (provider in ('google', 'openai', 'wavespeed'));
alter table public.generation_jobs
  add column if not exists content_set_id uuid references public.content_sets(id) on delete set null,
  add column if not exists content_output_id uuid references public.content_outputs(id) on delete set null,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb;

create index if not exists idx_content_sets_project_updated on public.content_sets(project_id, updated_at desc);
create index if not exists idx_content_outputs_set_created on public.content_outputs(content_set_id, created_at desc);
create index if not exists idx_content_outputs_job on public.content_outputs(generation_job_id);
create index if not exists idx_generation_jobs_lease on public.generation_jobs(status, lease_expires_at)
  where status in ('queued', 'running');
create unique index if not exists idx_generation_jobs_one_content_output
  on public.generation_jobs(content_output_id) where content_output_id is not null;

create or replace function public.set_content_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_sets_updated_at on public.content_sets;
create trigger content_sets_updated_at before update on public.content_sets
  for each row execute function public.set_content_updated_at();
drop trigger if exists content_outputs_updated_at on public.content_outputs;
create trigger content_outputs_updated_at before update on public.content_outputs
  for each row execute function public.set_content_updated_at();

alter table public.content_sets enable row level security;
alter table public.content_outputs enable row level security;
alter table public.content_output_reviews enable row level security;

drop policy if exists "Project collaborators can read content sets" on public.content_sets;
create policy "Project collaborators can read content sets" on public.content_sets for select to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
drop policy if exists "Project collaborators can create content sets" on public.content_sets;
create policy "Project collaborators can create content sets" on public.content_sets for insert to authenticated
  with check (created_by = auth.uid() and project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));
drop policy if exists "Project collaborators can update content sets" on public.content_sets;
create policy "Project collaborators can update content sets" on public.content_sets for update to authenticated
  using (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()))
  with check (project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid()));

drop policy if exists "Project collaborators can read content outputs" on public.content_outputs;
create policy "Project collaborators can read content outputs" on public.content_outputs for select to authenticated
  using (content_set_id in (select cs.id from public.content_sets cs where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));
drop policy if exists "Project collaborators can create content outputs" on public.content_outputs;
create policy "Project collaborators can create content outputs" on public.content_outputs for insert to authenticated
  with check (content_set_id in (select cs.id from public.content_sets cs where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));
drop policy if exists "Project collaborators can update content outputs" on public.content_outputs;
create policy "Project collaborators can update content outputs" on public.content_outputs for update to authenticated
  using (content_set_id in (select cs.id from public.content_sets cs where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())))
  with check (content_set_id in (select cs.id from public.content_sets cs where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));

drop policy if exists "Project collaborators can read output reviews" on public.content_output_reviews;
create policy "Project collaborators can read output reviews" on public.content_output_reviews for select to authenticated
  using (content_output_id in (select co.id from public.content_outputs co join public.content_sets cs on cs.id = co.content_set_id where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));
drop policy if exists "Project collaborators can create output reviews" on public.content_output_reviews;
create policy "Project collaborators can create output reviews" on public.content_output_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and content_output_id in (select co.id from public.content_outputs co join public.content_sets cs on cs.id = co.content_set_id where cs.project_id in (select id from public.projects where user_id = auth.uid() union select project_id from public.project_members where user_id = auth.uid())));

grant select, insert, update on public.content_sets, public.content_outputs, public.content_output_reviews to authenticated;
grant all on public.content_sets, public.content_outputs, public.content_output_reviews to service_role;

-- Video files stay private. The app serves a short-lived signed URL only after
-- checking the caller can read the owning ContentSet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-media', 'content-media', false, 104857600, array['video/mp4'])
on conflict (id) do nothing;

create index if not exists idx_project_transactions_request_id_once
  on public.project_transactions(request_id)
  where request_id is not null;

-- A client can retry a timed-out submission with the same request id without
-- being charged again. The caller receives the original transaction instead.
create or replace function public.atomic_deduct_project_points(
  _project_id uuid, _actor_user_id uuid, _cost integer, _description text,
  _request_id uuid default null, _ai_action text default null, _metadata jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare _wallet record; _new_points integer; _has_access boolean; _tx_id uuid;
begin
  if _request_id is not null then
    perform pg_advisory_xact_lock(hashtext(_request_id::text));
    select id into _tx_id from project_transactions where request_id = _request_id;
    if _tx_id is not null then
      select points into _new_points from project_wallets where project_id = _project_id;
      return jsonb_build_object('success', true, 'duplicate', true, 'points', coalesce(_new_points, 0), 'transaction_id', _tx_id);
    end if;
  end if;
  select exists (select 1 from projects p where p.id = _project_id and (p.user_id = _actor_user_id or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = _actor_user_id))) into _has_access;
  if not _has_access then return jsonb_build_object('success', false, 'error', 'Forbidden'); end if;
  insert into project_wallets (project_id, points) values (_project_id, 0) on conflict (project_id) do nothing;
  select id, points into _wallet from project_wallets where project_id = _project_id for update;
  if _wallet.points < _cost then return jsonb_build_object('success', false, 'error', 'Insufficient project points', 'points', _wallet.points, 'required', _cost); end if;
  _new_points := _wallet.points - _cost;
  update project_wallets set points = _new_points, updated_at = now() where id = _wallet.id;
  insert into project_transactions (project_id, actor_user_id, amount, type, description, status, request_id, ai_action, metadata)
    values (_project_id, _actor_user_id, _cost, 'payment', _description, 'completed', _request_id, _ai_action, _metadata) returning id into _tx_id;
  return jsonb_build_object('success', true, 'points', _new_points, 'wallet_id', _wallet.id, 'transaction_id', _tx_id);
end;
$$;
