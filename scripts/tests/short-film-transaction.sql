-- Run inside BEGIN / migration / ROLLBACK. No persistent fixtures or credit changes.
DO $$
declare project uuid; actor uuid; workspace int; plan uuid:=gen_random_uuid(); scene uuid:=gen_random_uuid();
 costly uuid; before_count int; q uuid; tid uuid:=gen_random_uuid(); run uuid:=gen_random_uuid(); owner uuid; got jsonb; n int;
begin
 select id,user_id,workspace_version into project,actor,workspace from projects order by created_at limit 1;
 perform save_film_plan(project,actor,workspace,plan,null,'{"title":"Transaction QA","brief":"QA","format":"9:16","resolution":"720p","audio_mode":"fixed","cast_snapshot":[],"target_duration_seconds":30}'::jsonb,
  jsonb_build_array(jsonb_build_object('id',scene,'scene_index',0,'cast_snapshot','[]'::jsonb,'dialogue','','action','QA','setting','QA','camera','close','duration_seconds',5,'follows_previous',false,'image_prompt','QA','motion_prompt','QA','source_mode','manual','input_hash','same')));
 begin perform save_film_plan(project,actor,workspace,plan,99,'{}','[]'); raise exception 'Expected version validation'; exception when others then if sqlerrm='Expected version validation' then raise; end if; end;
 insert into short_film_quotes(project_id,plan_id,plan_version,workspace_version,created_by,points,tasks) values(project,plan,1,workspace,actor,0,
  jsonb_build_array(jsonb_build_object('id',tid,'kind','image','sceneId',scene,'sceneVersion',1,'input',jsonb_build_object('subjectKey','qa'),'dependencies','[]'::jsonb,'points',0,'hash','qa'))) returning id into q;
 got:=accept_film_quote(q,actor,run); got:=accept_film_quote(q,actor,gen_random_uuid());
 if not(got->>'duplicate')::boolean then raise exception 'Idempotency failed'; end if;
 select count(*) into n from short_film_tasks where run_id=run; if n<>1 then raise exception 'Duplicate tasks'; end if;
 select lease_owner into owner from claim_film_tasks(false,2) where id=tid;
 if owner is null then raise exception 'Claim failed'; end if;
 if checkpoint_film_task(tid,gen_random_uuid(),'{}') then raise exception 'Stale owner accepted'; end if;
 update short_film_tasks set lease_expires_at=now()-interval '1 second' where id=tid;
 if checkpoint_film_task(tid,owner,'{}') then raise exception 'Expired heartbeat accepted'; end if;
 select lease_owner into owner from claim_film_tasks(false,2) where id=tid;
 if not complete_film_task(tid,owner,jsonb_build_object('path',project||'/qa.png')) then raise exception 'Complete failed'; end if;
 if complete_film_task(tid,owner,'{}') then raise exception 'Completed twice'; end if;
 select count(*) into before_count from short_film_tasks where project_id=project;
 insert into short_film_quotes(project_id,workspace_version,created_by,points,tasks) values(project,workspace,actor,999999999,
   jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','tts','input',jsonb_build_object('subjectKey','insufficient-qa'),'dependencies','[]'::jsonb,'points',999999999,'hash','qa'))) returning id into costly;
 begin
   perform accept_film_quote(costly,actor,gen_random_uuid());
   raise exception 'Accepted insufficient points';
 exception when others then if sqlerrm='Accepted insufficient points' then raise; end if;
 end;
 select count(*) into n from short_film_tasks where project_id=project;
 if n<>before_count then raise exception 'Insufficient points left partial tasks'; end if;
 if exists(select 1 from short_film_quotes where id=costly and accepted_key is not null) then raise exception 'Failed acceptance consumed quote'; end if;
 begin perform film_assert_access(project,gen_random_uuid(),workspace); raise exception 'Cross-project actor accepted'; exception when others then if sqlerrm='Cross-project actor accepted' then raise; end if; end;
 perform settle_film_failures();
 if has_table_privilege('authenticated','short_film_quotes','UPDATE') then raise exception 'Client can forge price'; end if;
 if has_function_privilege('authenticated','accept_film_quote(uuid,uuid,uuid)','EXECUTE') then raise exception 'Client can bypass route'; end if;
 perform approve_film_task(tid,project,actor,workspace);
 if not exists(select 1 from short_film_reviews where task_id=tid and reviewer_id=actor) then raise exception 'Missing review receipt'; end if;
 begin perform film_assert_access(project,actor,workspace+1);raise exception 'Stale workspace allowed';exception when others then if sqlerrm='Stale workspace allowed' then raise; end if;end;
end $$;
