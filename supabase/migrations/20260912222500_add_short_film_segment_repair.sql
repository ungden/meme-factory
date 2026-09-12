-- A source scene remains one provider clip. These rows describe independently
-- editable ranges inside that clip and the exact source selected for render.
create table public.short_film_segments (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.video_plans(id) on delete cascade,
  scene_id uuid not null references public.video_plan_scenes(id) on delete cascade,
  workspace_version integer not null,
  sequence_index integer not null check (sequence_index >= 0 and sequence_index < 24),
  active_revision integer not null default 1 check (active_revision > 0),
  selected_task_id uuid references public.short_film_tasks(id) on delete set null,
  selected_in_seconds numeric,
  selected_out_seconds numeric,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scene_id, sequence_index)
);

create table public.short_film_segment_revisions (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.short_film_segments(id) on delete cascade,
  revision integer not null check (revision > 0),
  plan_version integer not null check (plan_version > 0),
  scene_version integer not null check (scene_version > 0),
  speaker_character_id uuid references public.characters(id) on delete set null,
  voice_profile_version text,
  dialogue text not null default '',
  action text not null,
  camera text not null,
  motion_prompt text not null,
  image_prompt text not null default '',
  opening_state jsonb not null default '{}'::jsonb,
  closing_state jsonb not null default '{}'::jsonb,
  props jsonb not null default '[]'::jsonb,
  source_task_id uuid references public.short_film_tasks(id) on delete set null,
  source_in_seconds numeric not null check (source_in_seconds >= 0),
  source_out_seconds numeric not null check (source_out_seconds > source_in_seconds),
  timing_source text not null default 'planned'
    check (timing_source in ('planned','detected','manual')),
  timing_evidence jsonb not null default '{}'::jsonb,
  input_hash text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(segment_id, revision)
);

create table public.short_film_edit_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.video_plans(id) on delete cascade,
  workspace_version integer not null,
  version integer not null check (version > 0),
  items jsonb not null check (jsonb_typeof(items)='array'),
  input_hash text not null,
  render_task_id uuid references public.short_film_tasks(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(plan_id, version),
  unique(plan_id, input_hash)
);

alter table public.short_film_tasks
  add column segment_id uuid references public.short_film_segments(id) on delete set null,
  add column segment_revision integer;

create function public.capture_film_task_segment()
returns trigger language plpgsql set search_path=public as $$
begin
  if nullif(new.input->>'segmentId','') is not null then
    new.segment_id:=(new.input->>'segmentId')::uuid;
    new.segment_revision:=nullif(new.input->>'segmentRevision','')::integer;
    if not exists(
      select 1 from public.short_film_segments s
       where s.id=new.segment_id and s.project_id=new.project_id
         and s.plan_id=new.plan_id and s.workspace_version=new.workspace_version
    ) then raise exception 'SEGMENT_TASK_SCOPE_MISMATCH'; end if;
  end if;
  return new;
end $$;
create trigger short_film_task_segment_before_insert
  before insert on public.short_film_tasks
  for each row execute function public.capture_film_task_segment();

create index short_film_segments_plan_order
  on public.short_film_segments(plan_id, scene_id, sequence_index);
create index short_film_segment_revisions_current
  on public.short_film_segment_revisions(segment_id, revision desc);
create index short_film_tasks_segment
  on public.short_film_tasks(segment_id, segment_revision, created_at desc)
  where segment_id is not null;

alter table public.short_film_segments enable row level security;
alter table public.short_film_segment_revisions enable row level security;
alter table public.short_film_edit_manifests enable row level security;

revoke all on public.short_film_segments, public.short_film_segment_revisions,
  public.short_film_edit_manifests from public, anon, authenticated;
grant select on public.short_film_segments, public.short_film_segment_revisions,
  public.short_film_edit_manifests to authenticated;
grant all on public.short_film_segments, public.short_film_segment_revisions,
  public.short_film_edit_manifests to service_role;

create policy film_segments_read on public.short_film_segments
  for select to authenticated using (
    project_id in (select id from public.projects)
  );
create policy film_segment_revisions_read on public.short_film_segment_revisions
  for select to authenticated using (
    segment_id in (select id from public.short_film_segments)
  );
create policy film_edit_manifests_read on public.short_film_edit_manifests
  for select to authenticated using (
    project_id in (select id from public.projects)
  );

-- Create the first revision lazily when the user opens or edits a legacy beat.
create function public.save_film_segment_revision(
  p_project uuid,
  p_actor uuid,
  p_workspace integer,
  p_plan uuid,
  p_plan_version integer,
  p_scene uuid,
  p_segment uuid,
  p_sequence integer,
  p_expected_revision integer,
  p_revision jsonb
) returns public.short_film_segment_revisions
language plpgsql set search_path=public as $$
declare
  s public.short_film_segments;
  scene public.video_plan_scenes;
  next_revision integer;
  saved public.short_film_segment_revisions;
  prior public.short_film_segment_revisions;
begin
  perform public.film_assert_access(p_project,p_actor,p_workspace);
  select vps.* into scene from public.video_plan_scenes vps
    join public.video_plans vp on vp.id=vps.video_plan_id
   where vps.id=p_scene and vps.video_plan_id=p_plan and vps.deleted_at is null
     and vp.project_id=p_project and vp.workspace_version=p_workspace
     and vp.version=p_plan_version for update of vps;
  if not found then raise exception 'PLAN_OR_SCENE_VERSION_CONFLICT'; end if;
  if p_sequence<0 or p_sequence>=24 then raise exception 'SEGMENT_INDEX_INVALID'; end if;
  if length(coalesce(p_revision->>'action','')) not between 1 and 900
     or length(coalesce(p_revision->>'camera','')) not between 1 and 600
     or length(coalesce(p_revision->>'motionPrompt','')) not between 1 and 2000
     or length(coalesce(p_revision->>'dialogue',''))>700
     or coalesce((p_revision->>'inSeconds')::numeric,-1)<0
     or coalesce((p_revision->>'outSeconds')::numeric,0)<=coalesce((p_revision->>'inSeconds')::numeric,-1)
     or jsonb_typeof(coalesce(p_revision->'props','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_revision->'openingState','{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_revision->'closingState','{}'::jsonb))<>'object'
  then raise exception 'SEGMENT_REVISION_INVALID'; end if;

  insert into public.short_film_segments(
    id,project_id,plan_id,scene_id,workspace_version,sequence_index,created_by
  ) values(p_segment,p_project,p_plan,p_scene,p_workspace,p_sequence,p_actor)
  on conflict(id) do nothing;
  select * into s from public.short_film_segments where id=p_segment for update;
  if not found or s.project_id<>p_project or s.plan_id<>p_plan or
     s.scene_id<>p_scene or s.workspace_version<>p_workspace or
     s.sequence_index<>p_sequence then raise exception 'SEGMENT_SCOPE_MISMATCH'; end if;
  select * into prior from public.short_film_segment_revisions
   where segment_id=s.id and revision=s.active_revision;
  if (p_expected_revision is null and prior.id is not null) or
     (p_expected_revision is not null and s.active_revision<>p_expected_revision) then
    if prior.input_hash=p_revision->>'inputHash' and
       ((p_expected_revision is null and s.active_revision=1) or
        s.active_revision=p_expected_revision+1) then return prior; end if;
    raise exception 'SEGMENT_VERSION_CONFLICT';
  end if;
  next_revision:=case when exists(select 1 from public.short_film_segment_revisions r where r.segment_id=s.id)
    then s.active_revision+1 else 1 end;
  insert into public.short_film_segment_revisions(
    segment_id,revision,plan_version,scene_version,speaker_character_id,
    voice_profile_version,dialogue,action,camera,motion_prompt,image_prompt,
    opening_state,closing_state,props,source_task_id,source_in_seconds,
    source_out_seconds,timing_source,timing_evidence,input_hash,created_by
  ) values(
    s.id,next_revision,p_plan_version,scene.version,
    nullif(p_revision->>'speakerCharacterId','')::uuid,
    nullif(p_revision->>'voiceProfileVersion',''),
    coalesce(p_revision->>'dialogue',''),p_revision->>'action',p_revision->>'camera',
    p_revision->>'motionPrompt',coalesce(p_revision->>'imagePrompt',''),
    coalesce(p_revision->'openingState','{}'::jsonb),
    coalesce(p_revision->'closingState','{}'::jsonb),
    coalesce(p_revision->'props','[]'::jsonb),
    nullif(p_revision->>'sourceTaskId','')::uuid,
    (p_revision->>'inSeconds')::numeric,(p_revision->>'outSeconds')::numeric,
    coalesce(nullif(p_revision->>'timingSource',''),'planned'),
    coalesce(p_revision->'timingEvidence','{}'::jsonb),
    p_revision->>'inputHash',p_actor
  ) returning * into saved;
  update public.short_film_segments set active_revision=next_revision,
    selected_task_id=null,selected_in_seconds=null,selected_out_seconds=null,
    selected_by=null,selected_at=null,updated_at=now()
   where id=s.id;
  return saved;
end $$;

create function public.select_film_segment_source(
  p_project uuid,
  p_actor uuid,
  p_workspace integer,
  p_segment uuid,
  p_expected_revision integer,
  p_task uuid,
  p_in numeric,
  p_out numeric
) returns public.short_film_segments
language plpgsql set search_path=public as $$
declare s public.short_film_segments; t public.short_film_tasks;
begin
  perform public.film_assert_access(p_project,p_actor,p_workspace);
  select * into s from public.short_film_segments where id=p_segment for update;
  if not found or s.project_id<>p_project or s.workspace_version<>p_workspace
     or s.active_revision<>p_expected_revision then raise exception 'SEGMENT_VERSION_CONFLICT'; end if;
  select * into t from public.short_film_tasks where id=p_task and project_id=p_project
    and workspace_version=p_workspace and status='completed'
    and kind in ('video','dub','lip_sync') for update;
  if not found or not (
    t.scene_id=s.scene_id or
    (t.segment_id=s.id and t.segment_revision=s.active_revision)
  ) then raise exception 'SEGMENT_SOURCE_INVALID'; end if;
  if p_in<0 or p_out<=p_in or p_out>coalesce((t.result->>'duration')::numeric,0)+0.05
    then raise exception 'SEGMENT_RANGE_INVALID'; end if;
  update public.short_film_segments set selected_task_id=t.id,
    selected_in_seconds=p_in,selected_out_seconds=p_out,
    selected_by=p_actor,selected_at=now(),updated_at=now()
   where id=s.id returning * into s;
  insert into public.short_film_reviews(task_id,reviewer_id)
    values(t.id,p_actor) on conflict do nothing;
  update public.short_film_tasks set approved_by=p_actor,approved_at=coalesce(approved_at,now())
    where id=t.id;
  return s;
end $$;

revoke all on function public.save_film_segment_revision(uuid,uuid,integer,uuid,integer,uuid,uuid,integer,integer,jsonb),
  public.select_film_segment_source(uuid,uuid,integer,uuid,integer,uuid,numeric,numeric)
  from public,anon,authenticated;
grant execute on function public.save_film_segment_revision(uuid,uuid,integer,uuid,integer,uuid,uuid,integer,integer,jsonb),
  public.select_film_segment_source(uuid,uuid,integer,uuid,integer,uuid,numeric,numeric)
  to service_role;

revoke all on function public.capture_film_task_segment() from public,anon,authenticated;

-- Quotes are accepted after the manifest has been frozen, so link the render
-- task only when that task really exists. This keeps retrying a quote from
-- leaving a dangling task id in the immutable manifest.
create function public.link_film_edit_manifest()
returns trigger language plpgsql set search_path=public as $$
declare manifest uuid;
begin
  if new.kind='render' and nullif(new.input->>'editManifestId','') is not null then
    manifest:=(new.input->>'editManifestId')::uuid;
    update public.short_film_edit_manifests
       set render_task_id=new.id
     where id=manifest and project_id=new.project_id and plan_id=new.plan_id
       and workspace_version=new.workspace_version and render_task_id is null;
    if not found then raise exception 'EDIT_MANIFEST_SCOPE_MISMATCH'; end if;
  end if;
  return new;
end $$;
create trigger short_film_task_manifest_after_insert
  after insert on public.short_film_tasks
  for each row execute function public.link_film_edit_manifest();
revoke all on function public.link_film_edit_manifest() from public,anon,authenticated;
