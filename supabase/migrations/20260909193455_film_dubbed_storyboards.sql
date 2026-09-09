-- Preserve existing native/fixed jobs and media; all new UI films use per-turn dubbing.
alter table public.video_plans drop constraint video_plans_audio_mode_check;
alter table public.video_plans add constraint video_plans_audio_mode_check check (audio_mode in ('native','fixed','dubbed'));
alter table public.video_plans alter column audio_mode set default 'dubbed';
alter table public.short_film_tasks drop constraint short_film_tasks_kind_check;
alter table public.short_film_tasks add constraint short_film_tasks_kind_check check (kind in ('image','voice_design','tts','video','lip_sync','dub','transcribe','render','frame'));
create or replace function public.save_film_plan(p_project uuid,p_actor uuid,p_workspace integer,p_id uuid,p_expected integer,p_plan jsonb,p_scenes jsonb)
returns uuid language plpgsql set search_path=public as $$
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
 audio_mode=p_plan->>'audio_mode',generate_audio=(p_plan->>'audio_mode')='native',caption=coalesce(p_plan->>'caption',''),
 subtitles=coalesce((p_plan->>'subtitles')::boolean,true),target_duration_seconds=(p_plan->>'target_duration_seconds')::integer,
 story=coalesce(p_plan->'story',v.story), trim_speech=coalesce((p_plan->>'trim_speech')::boolean,false),
 cast_snapshot=p_plan->'cast_snapshot',version=ver,status='draft',quote_snapshot=null,quote_expires_at=null where id=p_id;
 -- Vacate only ordering slots; do not delete historical scene/media rows.
 update video_plan_scenes set deleted_at=now() where video_plan_id=p_id and deleted_at is null;
 for s in select value from jsonb_array_elements(p_scenes) loop
  if nullif(s->'storyboard','null'::jsonb) is not null and p_plan->>'audio_mode'='fixed' then raise exception 'STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED'; end if;
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

create or replace function public.claim_film_tasks(p_render boolean,p_limit integer default 2) returns setof short_film_tasks language plpgsql set search_path=public as $$
declare t short_film_tasks; slots integer; taken integer:=0;
begin
 if p_limit<1 or p_limit>2 then raise exception 'INVALID_BATCH'; end if;
 perform pg_advisory_xact_lock(case when p_render then 8172601 else 8172602 end);
 select greatest(0,(case when p_render then 1 else 2 end)-count(*))::integer into slots from short_film_tasks
  where status in ('running','reconciling') and ((kind in ('render','frame','dub'))=p_render);
 for t in select a.* from short_film_tasks a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
  where a.status in ('queued','running') and a.next_poll_at<=now() and (a.lease_expires_at is null or a.lease_expires_at<=now())
   and ((a.kind in ('render','frame','dub'))=p_render)
   and not exists(select 1 from unnest(a.dependencies) dep left join short_film_tasks d on d.id=dep where d.id is null or d.status<>'completed')
  order by (a.status='running') desc,a.next_poll_at,a.created_at for update of a skip locked
 loop
  if taken>=p_limit then exit; end if;
  if t.status='queued' and slots<=0 then continue; end if;
  if t.status='queued' then slots:=slots-1; end if;
  update short_film_tasks set status='running',lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',updated_at=now() where id=t.id returning * into t;
  update generation_jobs set status='running',started_at=coalesce(started_at,now()),phase=t.kind where id=t.generation_job_id;
  taken:=taken+1;return next t;
 end loop;
end $$;

