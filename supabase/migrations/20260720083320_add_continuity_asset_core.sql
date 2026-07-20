-- Continuity Studio core for Meme Factory.
-- Additive and backward compatible: legacy characters, poses, memes and APIs remain valid.

create schema if not exists private;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  legacy_character_id uuid unique references public.characters(id) on delete set null,
  kind text not null check (kind in ('character', 'look', 'item', 'environment', 'style')),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'locked', 'archived')),
  identity_profile_type text not null default 'none'
    check (identity_profile_type in ('none', 'human', 'mascot', 'product')),
  notes text,
  invariants jsonb not null default '[]'::jsonb,
  usage_rights jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (asset_id, version),
  unique (asset_id, content_hash)
);

create table if not exists public.identity_cards (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null unique references public.asset_versions(id) on delete cascade,
  summary text not null default '',
  must_preserve jsonb not null default '[]'::jsonb,
  may_change jsonb not null default '[]'::jsonb,
  proportions jsonb not null default '{}'::jsonb,
  identifying_details jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reference_images (
  id uuid primary key default gen_random_uuid(),
  asset_version_id uuid not null references public.asset_versions(id) on delete cascade,
  legacy_character_pose_id uuid unique references public.character_poses(id) on delete set null,
  role text not null check (role in (
    'edit_base', 'previous_shot', 'identity_face', 'identity_body',
    'look', 'item', 'environment', 'style'
  )),
  subject_id text,
  image_url text not null,
  source_hash text not null,
  source_type text not null default 'uploaded'
    check (source_type in ('uploaded', 'legacy_url', 'generated', 'provider_output')),
  mime_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  quality_report jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  reproducible boolean not null default true,
  priority integer not null default 50,
  created_at timestamptz not null default now(),
  unique (asset_version_id, source_hash, role)
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creation_kind text not null check (creation_kind in ('meme', 'fashion_shot', 'storyboard_shot')),
  source_entity_type text,
  source_entity_id uuid,
  workflow_version text not null default 'meme-v1',
  provider text not null check (provider in ('google', 'openai')),
  model text not null,
  continuity_policy text not null default 'balanced'
    check (continuity_policy in ('strict', 'balanced', 'creative')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  compiled_prompt text not null,
  reference_manifest jsonb not null default '[]'::jsonb,
  dropped_references jsonb not null default '[]'::jsonb,
  manifest_hash text not null,
  requested_output jsonb not null default '{}'::jsonb,
  provider_request_id text,
  provider_response jsonb,
  estimated_points integer not null default 0 check (estimated_points >= 0),
  actual_points integer check (actual_points is null or actual_points >= 0),
  estimated_cost_usd numeric(12, 6),
  actual_cost_usd numeric(12, 6),
  usage jsonb,
  error jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.generation_outputs (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references public.generation_jobs(id) on delete cascade,
  parent_output_id uuid references public.generation_outputs(id) on delete set null,
  variant_index integer not null check (variant_index >= 0),
  object_url text not null,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'needs_review', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (generation_job_id, variant_index)
);

alter table public.characters
  add column if not exists continuity_asset_id uuid references public.assets(id) on delete set null;

alter table public.memes
  add column if not exists generation_job_id uuid references public.generation_jobs(id) on delete set null;

create unique index if not exists idx_characters_continuity_asset_id
  on public.characters(continuity_asset_id)
  where continuity_asset_id is not null;

create index if not exists idx_assets_project_kind on public.assets(project_id, kind);
create index if not exists idx_asset_versions_asset_status on public.asset_versions(asset_id, status, version desc);
create index if not exists idx_reference_images_version_role on public.reference_images(asset_version_id, role, priority desc);
create index if not exists idx_generation_jobs_project_created on public.generation_jobs(project_id, created_at desc);
create index if not exists idx_generation_jobs_status_created on public.generation_jobs(status, created_at);
create index if not exists idx_generation_outputs_parent on public.generation_outputs(parent_output_id);
create index if not exists idx_memes_generation_job_id on public.memes(generation_job_id);

-- Backfill each legacy character as a stable asset. Reusing the character UUID makes
-- the compatibility mapping deterministic while legacy UI/API code stays untouched.
insert into public.assets (id, project_id, legacy_character_id, kind, name, created_by, created_at, updated_at)
select c.id, c.project_id, c.id, 'character', c.name, p.user_id, c.created_at, c.updated_at
from public.characters c
join public.projects p on p.id = c.project_id
on conflict (id) do nothing;

update public.characters c
set continuity_asset_id = c.id
where c.continuity_asset_id is null
  and exists (select 1 from public.assets a where a.id = c.id);

insert into public.asset_versions (
  asset_id, version, status, identity_profile_type, notes, invariants,
  usage_rights, content_hash, created_by, created_at, locked_at
)
select
  c.id,
  1,
  case
    when c.avatar_url is not null or exists (
      select 1 from public.character_poses cp where cp.character_id = c.id
    ) then 'locked'
    else 'draft'
  end,
  'mascot',
  nullif(c.description, ''),
  jsonb_build_object(
    'legacy_description', c.description,
    'legacy_personality', c.personality,
    'migration_source', 'characters'
  ),
  jsonb_build_object('status', 'unconfirmed', 'migration_source', 'legacy'),
  'legacy:character:' || c.id::text || ':v1',
  p.user_id,
  c.created_at,
  case
    when c.avatar_url is not null or exists (
      select 1 from public.character_poses cp where cp.character_id = c.id
    ) then now()
    else null
  end
from public.characters c
join public.projects p on p.id = c.project_id
where exists (select 1 from public.assets a where a.id = c.id)
on conflict (asset_id, version) do nothing;

insert into public.identity_cards (
  asset_version_id, summary, must_preserve, may_change, coverage, approved_by, approved_at, created_at
)
select
  av.id,
  trim(concat_ws('. ', nullif(c.description, ''), nullif(c.personality, ''))),
  jsonb_build_array(
    'species and core character concept',
    'recognizable silhouette',
    'signature palette and facial details'
  ),
  jsonb_build_array('expression', 'pose', 'scene', 'dialogue'),
  jsonb_build_object(
    'face', c.avatar_url is not null,
    'body', exists (select 1 from public.character_poses cp where cp.character_id = c.id),
    'legacy_unverified', true
  ),
  p.user_id,
  case when av.status = 'locked' then av.locked_at else null end,
  c.created_at
from public.characters c
join public.projects p on p.id = c.project_id
join public.asset_versions av on av.asset_id = c.id and av.version = 1
on conflict (asset_version_id) do nothing;

insert into public.reference_images (
  asset_version_id, role, subject_id, image_url, source_hash, source_type,
  is_primary, reproducible, priority, created_at
)
select
  av.id,
  'identity_face',
  c.id::text,
  c.avatar_url,
  'legacy-url-md5:' || md5(c.avatar_url),
  'legacy_url',
  true,
  true,
  100,
  c.created_at
from public.characters c
join public.asset_versions av on av.asset_id = c.id and av.version = 1
where c.avatar_url is not null
on conflict (asset_version_id, source_hash, role) do nothing;

insert into public.reference_images (
  asset_version_id, legacy_character_pose_id, role, subject_id, image_url,
  source_hash, source_type, is_primary, reproducible, priority, created_at
)
select
  av.id,
  cp.id,
  'identity_body',
  c.id::text,
  cp.image_url,
  'legacy-url-md5:' || md5(cp.image_url),
  'legacy_url',
  false,
  true,
  90,
  cp.created_at
from public.character_poses cp
join public.characters c on c.id = cp.character_id
join public.asset_versions av on av.asset_id = c.id and av.version = 1
on conflict (asset_version_id, source_hash, role) do nothing;

create or replace function private.prevent_locked_asset_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Locked or archived asset versions are immutable';
    end if;
    return old;
  end if;

  if old.status = 'archived' then
    raise exception 'Archived asset versions are immutable';
  end if;

  if old.status = 'locked' then
    if new.status = 'archived'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      return new;
    end if;
    raise exception 'Locked asset versions are immutable; create a new version';
  end if;

  return new;
end;
$$;

create or replace function private.prevent_locked_version_child_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_version_id uuid;
  target_status text;
begin
  target_version_id := case when tg_op = 'DELETE' then old.asset_version_id else new.asset_version_id end;
  select av.status into target_status
  from public.asset_versions av
  where av.id = target_version_id;

  if target_status in ('locked', 'archived') then
    raise exception 'References and identity cards on locked asset versions are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_locked_asset_version_mutation on public.asset_versions;
create trigger prevent_locked_asset_version_mutation
  before update or delete on public.asset_versions
  for each row execute function private.prevent_locked_asset_version_mutation();

drop trigger if exists prevent_locked_reference_image_mutation on public.reference_images;
create trigger prevent_locked_reference_image_mutation
  before insert or update or delete on public.reference_images
  for each row execute function private.prevent_locked_version_child_mutation();

drop trigger if exists prevent_locked_identity_card_mutation on public.identity_cards;
create trigger prevent_locked_identity_card_mutation
  before insert or update or delete on public.identity_cards
  for each row execute function private.prevent_locked_version_child_mutation();

revoke all on function private.prevent_locked_asset_version_mutation() from public, anon, authenticated;
revoke all on function private.prevent_locked_version_child_mutation() from public, anon, authenticated;

alter table public.assets enable row level security;
alter table public.asset_versions enable row level security;
alter table public.identity_cards enable row level security;
alter table public.reference_images enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_outputs enable row level security;

revoke all on public.assets, public.asset_versions, public.identity_cards,
  public.reference_images, public.generation_jobs, public.generation_outputs
  from public, anon;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.asset_versions to authenticated;
grant select, insert, update, delete on public.identity_cards to authenticated;
grant select, insert, update, delete on public.reference_images to authenticated;
grant select on public.generation_jobs, public.generation_outputs to authenticated;
grant all on public.assets, public.asset_versions, public.identity_cards,
  public.reference_images, public.generation_jobs, public.generation_outputs to service_role;

create policy "Project collaborators can view assets"
  on public.assets for select to authenticated
  using (
    (select auth.uid()) is not null and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can create assets"
  on public.assets for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can update assets"
  on public.assets for update to authenticated
  using (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  )
  with check (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can delete assets"
  on public.assets for delete to authenticated
  using (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can view asset versions"
  on public.asset_versions for select to authenticated
  using (
    asset_id in (
      select a.id from public.assets a where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can create asset versions"
  on public.asset_versions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and asset_id in (
      select a.id from public.assets a where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can update draft asset versions"
  on public.asset_versions for update to authenticated
  using (
    asset_id in (
      select a.id from public.assets a where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    asset_id in (
      select a.id from public.assets a where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can delete draft asset versions"
  on public.asset_versions for delete to authenticated
  using (
    asset_id in (
      select a.id from public.assets a where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can manage identity cards"
  on public.identity_cards for all to authenticated
  using (
    asset_version_id in (
      select av.id
      from public.asset_versions av
      join public.assets a on a.id = av.asset_id
      where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    asset_version_id in (
      select av.id
      from public.asset_versions av
      join public.assets a on a.id = av.asset_id
      where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can manage reference images"
  on public.reference_images for all to authenticated
  using (
    asset_version_id in (
      select av.id
      from public.asset_versions av
      join public.assets a on a.id = av.asset_id
      where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    asset_version_id in (
      select av.id
      from public.asset_versions av
      join public.assets a on a.id = av.asset_id
      where a.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can view generation jobs"
  on public.generation_jobs for select to authenticated
  using (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can view generation outputs"
  on public.generation_outputs for select to authenticated
  using (
    generation_job_id in (
      select gj.id from public.generation_jobs gj where gj.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );
