-- Keep the exact generation model on every editable plan and durable run.
-- Existing films remain on Seedance 2.5; users can explicitly choose Fast.
alter table public.video_plans
  add column if not exists video_model text not null
  default 'bytedance/seedance-2.5/image-to-video';

alter table public.video_plans
  drop constraint if exists video_plans_video_model_check;
alter table public.video_plans
  add constraint video_plans_video_model_check check (video_model in (
    'bytedance/seedance-2.5/image-to-video',
    'bytedance/seedance-2.0-fast/image-to-video'
  ));

alter table public.short_film_production_runs
  add column if not exists video_model text not null
  default 'bytedance/seedance-2.5/image-to-video';
alter table public.short_film_production_runs
  drop constraint if exists short_film_runs_video_model_check;
alter table public.short_film_production_runs
  add constraint short_film_runs_video_model_check check (video_model in (
    'bytedance/seedance-2.5/image-to-video',
    'bytedance/seedance-2.0-fast/image-to-video'
  ));

create or replace function public.save_film_plan(
  p_project uuid,p_actor uuid,p_workspace integer,p_id uuid,p_expected integer,
  p_plan jsonb,p_scenes jsonb
) returns uuid language plpgsql set search_path=public as $$
declare v video_plans; s jsonb; sid uuid; seen uuid[]:='{}'; prior video_plan_scenes; ver integer;
begin
 perform film_assert_access(p_project,p_actor,p_workspace);
 if jsonb_array_length(p_scenes) not between 1 and 12 then raise exception 'INVALID_SCENES'; end if;
 if p_expected is null then
  insert into video_plans(id,project_id,created_by,workspace_version) values(p_id,p_project,p_actor,p_workspace) returning * into v;
 else
  select * into v from video_plans where id=p_id and project_id=p_project and workspace_version=p_workspace for update;
  if not found or v.version<>p_expected then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 ver:=case when p_expected is null then 1 else v.version+1 end;
 update video_plans set title=p_plan->>'title',brief=p_plan->>'brief',format=p_plan->>'format',resolution=p_plan->>'resolution',
 video_model=coalesce(p_plan->>'video_model','bytedance/seedance-2.5/image-to-video'),
 audio_mode=p_plan->>'audio_mode',generate_audio=(p_plan->>'audio_mode')='native',caption=coalesce(p_plan->>'caption',''),
 subtitles=coalesce((p_plan->>'subtitles')::boolean,true),target_duration_seconds=(p_plan->>'target_duration_seconds')::integer,
 story=coalesce(p_plan->'story',v.story),trim_speech=coalesce((p_plan->>'trim_speech')::boolean,false),
 cast_snapshot=p_plan->'cast_snapshot',version=ver,status='draft',quote_snapshot=null,quote_expires_at=null where id=p_id;
 update video_plan_scenes set deleted_at=now() where video_plan_id=p_id and deleted_at is null;
 for s in select value from jsonb_array_elements(p_scenes) loop
  if nullif(s->'storyboard','null'::jsonb) is not null and p_plan->>'audio_mode'='fixed' then raise exception 'STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED'; end if;
  if (s->>'duration_seconds')::integer > (case when p_plan->>'video_model'='bytedance/seedance-2.0-fast/image-to-video' then 15 else 30 end) then raise exception 'SCENE_EXCEEDS_MODEL_DURATION'; end if;
  sid:=(s->>'id')::uuid;
  select * into prior from video_plan_scenes where id=sid;
  if found and prior.video_plan_id<>p_id then raise exception 'SCENE_PROJECT_MISMATCH'; end if;
  if sid=any(seen) then raise exception 'DUPLICATE_SCENE'; end if; seen:=array_append(seen,sid);
  insert into video_plan_scenes(id,video_plan_id,scene_index,version,cast_snapshot,speaker_character_id,dialogue,action,setting,camera,
   duration_seconds,start_image_url,end_image_url,follows_previous,image_prompt,motion_prompt,source_mode,input_hash,storyboard)
  values(sid,p_id,(s->>'scene_index')::integer,1,s->'cast_snapshot',(s->>'speaker_character_id')::uuid,s->>'dialogue',s->>'action',s->>'setting',s->>'camera',
   (s->>'duration_seconds')::integer,s->>'start_image_url',s->>'end_image_url',(s->>'follows_previous')::boolean,s->>'image_prompt',s->>'motion_prompt',s->>'source_mode',s->>'input_hash',nullif(s->'storyboard','null'::jsonb))
  on conflict(id) do update set scene_index=excluded.scene_index,deleted_at=null,
   version=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.version else video_plan_scenes.version+1 end,
   cast_snapshot=excluded.cast_snapshot,speaker_character_id=excluded.speaker_character_id,dialogue=excluded.dialogue,action=excluded.action,setting=excluded.setting,camera=excluded.camera,
   duration_seconds=excluded.duration_seconds,start_image_url=excluded.start_image_url,end_image_url=excluded.end_image_url,follows_previous=excluded.follows_previous,
   image_prompt=excluded.image_prompt,motion_prompt=excluded.motion_prompt,source_mode=excluded.source_mode,input_hash=excluded.input_hash,storyboard=excluded.storyboard,
   media_links=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.media_links else '{}'::jsonb end,
   status=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.status else 'draft' end;
 end loop;
 return p_id;
end $$;

create or replace function public.create_film_production_run_v2(
  p_project uuid,p_actor uuid,p_workspace integer,p_plan uuid,p_plan_version integer,
  p_intent text,p_max_film integer,p_max_day integer,p_key uuid,p_source text,
  p_schedule_date date,p_video_model text
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
  else selected_model:=coalesce(p_video_model,'bytedance/seedance-2.5/image-to-video'); end if;
  if selected_model not in ('bytedance/seedance-2.5/image-to-video','bytedance/seedance-2.0-fast/image-to-video') then raise exception 'INVALID_VIDEO_MODEL'; end if;
  local_day:=coalesce(p_schedule_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
  insert into short_film_production_runs(project_id,workspace_version,plan_id,plan_version,source,intent,status,phase,max_points_per_film,max_points_per_day,budget_date,idempotency_key,scheduler_date,created_by,video_model)
  values(p_project,p_workspace,p_plan,p_plan_version,p_source,left(coalesce(p_intent,''),4000),case when p_plan is null then 'scripting' else 'queued' end,case when p_plan is null then 'script' else 'prepare' end,p_max_film,p_max_day,local_day,p_key,p_schedule_date,p_actor,selected_model)
  on conflict(project_id,idempotency_key) do nothing returning id into rid;
  if rid is null then
    select * into prior from short_film_production_runs where project_id=p_project and idempotency_key=p_key;
    if prior.plan_id is distinct from p_plan or prior.plan_version is distinct from p_plan_version or prior.intent is distinct from left(coalesce(p_intent,''),4000) or prior.video_model<>selected_model then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    rid:=prior.id;
  end if;
  return rid;
end $$;

revoke all on function public.create_film_production_run_v2(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.create_film_production_run_v2(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text) to service_role;

create or replace function public.schedule_due_film_automations() returns integer
language plpgsql set search_path=public as $$
declare s short_film_automation_settings; local_day date; chosen uuid; chosen_version integer; rid uuid; n integer:=0; selected_model text;
begin
  for s in select a.* from short_film_automation_settings a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
    where a.enabled and a.local_time <= (now() at time zone a.timezone)::time and a.last_schedule_date is distinct from (now() at time zone a.timezone)::date
    order by a.updated_at for update of a skip locked loop
    chosen:=null; chosen_version:=null;
    local_day:=(now() at time zone s.timezone)::date;
    if exists(select 1 from short_film_production_runs r where r.project_id=s.project_id and r.status in ('queued','scripting','running','paused','budget_blocked')) then continue; end if;
    select v.id,v.version into chosen,chosen_version from unnest(s.queued_plan_ids) with ordinality q(id,ord)
      join video_plans v on v.id=q.id and v.project_id=s.project_id and v.workspace_version=s.workspace_version
      where v.status not in ('completed','approved','cancelled') order by q.ord limit 1;
    selected_model:=coalesce(s.default_config->>'videoModel','bytedance/seedance-2.5/image-to-video');
    rid:=public.create_film_production_run_v2(s.project_id,s.created_by,s.workspace_version,chosen,chosen_version,'',s.max_points_per_film,s.max_points_per_day,md5(s.project_id::text||local_day::text)::uuid,'scheduled',local_day,selected_model);
    update short_film_automation_settings set last_schedule_date=local_day,updated_at=now(),queued_plan_ids=case when chosen is null then queued_plan_ids else array_remove(queued_plan_ids,chosen) end where project_id=s.project_id;
    n:=n+1;
  end loop;
  return n;
end $$;

comment on column public.video_plans.video_model is
  'Exact WaveSpeed image-to-video model frozen for this plan revision.';
comment on column public.short_film_production_runs.video_model is
  'Exact WaveSpeed image-to-video model frozen when the production run is accepted.';
