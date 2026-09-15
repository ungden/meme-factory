-- Per-video guest characters: a guest (pilot, expert, neighbour, …) is generated
-- for one plan only and never pollutes the mascot/character library. The plan
-- reuses the generated reference image for its own scenes; a fresh video
-- generates a fresh guest.
create table public.film_guest_characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.video_plans(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  personality text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, key)
);
create index film_guest_characters_plan on public.film_guest_characters(plan_id);

alter table public.film_guest_characters enable row level security;
revoke all on public.film_guest_characters from public, anon, authenticated;
grant all on public.film_guest_characters to service_role;

-- Intent-based production runs may carry guest slots into the writing stage.
alter table public.short_film_production_runs
  add column if not exists guests jsonb not null default '[]'::jsonb;

create or replace function public.create_film_production_run_v2(
  p_project uuid,p_actor uuid,p_workspace integer,p_plan uuid,p_plan_version integer,
  p_intent text,p_max_film integer,p_max_day integer,p_key uuid,p_source text,
  p_schedule_date date,p_video_model text,p_guests jsonb default '[]'::jsonb
) returns uuid language plpgsql set search_path=public as $$
declare rid uuid; owner_id uuid; local_day date; selected_model text; prior short_film_production_runs;
begin
  perform public.film_assert_access(p_project,p_actor,p_workspace);
  if p_max_film<=0 or p_max_day<p_max_film then raise exception 'INVALID_BUDGET'; end if;
  if p_source not in ('manual','scheduled') then raise exception 'INVALID_SOURCE'; end if;
  select user_id into owner_id from projects where id=p_project;
  if p_source='scheduled' and owner_id<>p_actor then raise exception 'OWNER_REQUIRED'; end if;
  if p_plan is not null then
    select video_model into selected_model from video_plans where id=p_plan and project_id=p_project and workspace_version=p_workspace and version=p_plan_version;
    if selected_model is null then raise exception 'PLAN_VERSION_CHANGED'; end if;
  else selected_model:=coalesce(p_video_model,'bytedance/seedance-2.5/text-to-video'); end if;
  if selected_model not in ('bytedance/seedance-2.5/text-to-video','bytedance/seedance-2.0-fast/text-to-video') then raise exception 'INVALID_VIDEO_MODEL'; end if;
  local_day:=coalesce(p_schedule_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
  insert into short_film_production_runs(project_id,workspace_version,plan_id,plan_version,source,intent,status,phase,max_points_per_film,max_points_per_day,budget_date,idempotency_key,scheduler_date,guests,created_by,video_model)
  values(p_project,p_workspace,p_plan,p_plan_version,p_source,left(coalesce(p_intent,''),4000),case when p_plan is null then 'scripting' else 'queued' end,case when p_plan is null then 'script' else 'prepare' end,p_max_film,p_max_day,local_day,p_key,p_schedule_date,coalesce(p_guests,'[]'::jsonb),p_actor,selected_model)
  on conflict(project_id,idempotency_key) do nothing returning id into rid;
  if rid is null then
    select * into prior from short_film_production_runs where project_id=p_project and idempotency_key=p_key;
    if prior.plan_id is distinct from p_plan or prior.plan_version is distinct from p_plan_version or prior.intent is distinct from left(coalesce(p_intent,''),4000) or prior.video_model<>selected_model or prior.guests is distinct from coalesce(p_guests,'[]'::jsonb) then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    rid:=prior.id;
  end if;
  return rid;
end $$;

revoke all on function public.create_film_production_run_v2(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_film_production_run_v2(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text,jsonb) to service_role;