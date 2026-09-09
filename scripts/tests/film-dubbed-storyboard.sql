-- Run in BEGIN / ROLLBACK after the storyboard migration. No media jobs created.
DO $$
declare p uuid; actor uuid; workspace int; plan uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
 config jsonb; rowdata jsonb; board jsonb; v int;
begin
 select id,user_id,workspace_version into strict p,actor,workspace from projects order by created_at limit 1;
 config:='{"title":"Dubbed storyboard transaction QA","brief":"QA","format":"16:9","resolution":"720p","audio_mode":"dubbed","cast_snapshot":[],"target_duration_seconds":30}'::jsonb;
 board:='{"version":1,"durationSeconds":15,"beats":[{"startSeconds":0,"endSeconds":15,"speakerCharacterId":null,"dialogue":"","action":"Reaction","camera":"Pan","motion":"Look up"}]}'::jsonb;
 rowdata:=jsonb_build_object('id',sid,'scene_index',0,'cast_snapshot','[]'::jsonb,'dialogue','','action','QA','setting','QA','camera','pan','duration_seconds',15,'follows_previous',false,'image_prompt','QA','motion_prompt','QA','source_mode','ai','input_hash','board-v1','storyboard',board);
 perform save_film_plan(p,actor,workspace,plan,null,config,jsonb_build_array(rowdata));
 if not exists(select 1 from video_plan_scenes where id=sid and storyboard=board and duration_seconds=15) then raise exception 'BOARD_LOST'; end if;
 update video_plan_scenes set media_links='{"video":"old-clip"}'::jsonb where id=sid;
 perform save_film_plan(p,actor,workspace,plan,1,config,jsonb_build_array(rowdata));
 if not exists(select 1 from video_plan_scenes where id=sid and version=1 and media_links->>'video'='old-clip') then raise exception 'UNCHANGED_MEDIA_LOST'; end if;
 begin
  perform save_film_plan(p,actor,workspace,plan,1,config,jsonb_build_array(rowdata));
  raise exception 'STALE_VERSION_ACCEPTED';
 exception when others then if sqlerrm not like '%VERSION_CONFLICT%' then raise; end if; end;
 board:=jsonb_set(board,'{beats,0,action}','"Look left"');
 rowdata:=rowdata||jsonb_build_object('input_hash','board-v2','storyboard',board);
 perform save_film_plan(p,actor,workspace,plan,2,config,jsonb_build_array(rowdata));
 if not exists(select 1 from video_plan_scenes where id=sid and version=2 and storyboard=board and media_links='{}'::jsonb) then raise exception 'REVISION_NOT_INVALIDATED'; end if;
 begin
  perform save_film_plan(p,actor,workspace,plan,3,config,jsonb_build_array(rowdata||'{"duration_seconds":5}'::jsonb));
  raise exception 'WRONG_DURATION_ACCEPTED';
 exception when check_violation then null; end;
 select version into v from video_plans where id=plan;
 if v<>3 then raise exception 'PARTIAL_SAVE'; end if;
 begin
  perform save_film_plan(p,actor,workspace,plan,3,config||'{"audio_mode":"fixed"}'::jsonb,jsonb_build_array(rowdata));
  raise exception 'FIXED_BOARD_ACCEPTED';
 exception when others then if sqlerrm not like '%STORYBOARD_SINGLE_SPEAKER_SYNC_UNSUPPORTED%' then raise; end if; end;
 if has_table_privilege('authenticated','video_plan_scenes','UPDATE') then raise exception 'CLIENT_WRITES_ALLOWED'; end if;
end $$;
