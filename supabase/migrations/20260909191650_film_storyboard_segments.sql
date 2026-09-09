-- Existing plans, prices, outputs and references remain unchanged.
alter table public.video_plan_scenes add column storyboard jsonb;
alter table public.video_plan_scenes add constraint video_scene_storyboard_shape check (
 storyboard is null or (jsonb_typeof(storyboard)='object' and storyboard->>'version'='1'
 and storyboard->>'durationSeconds'='15' and duration_seconds=15
 and jsonb_typeof(storyboard->'beats')='array' and jsonb_array_length(storyboard->'beats') between 1 and 12) is true
);
comment on column public.video_plan_scenes.storyboard is 'Versioned 15s planned beats. Timings are direction only, never subtitle evidence.';
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
  if nullif(s->'storyboard','null'::jsonb) is not null and p_plan->>'audio_mode'<>'native' then raise exception 'STORYBOARD_NATIVE_REQUIRED'; end if;
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
