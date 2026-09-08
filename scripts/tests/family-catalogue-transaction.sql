-- Caller wraps BEGIN / ROLLBACK. No enduring review, draft or balance mutations.
DO $$
declare p projects; id uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); body jsonb; scenes jsonb;
begin
 select * into p from projects order by created_at limit 1;
 body:='{"title":"QA only","brief":"QA","format":"9:16","resolution":"720p","audio_mode":"fixed","cast_snapshot":[],"target_duration_seconds":35,"story":{"profileVersion":1},"trim_speech":true}';
 scenes:=jsonb_build_array(jsonb_build_object('id',sid,'scene_index',0,'cast_snapshot','[]'::jsonb,'dialogue','','action','QA','setting','QA','camera','close','duration_seconds',5,'follows_previous',false,'image_prompt','QA','motion_prompt','QA','source_mode','manual','input_hash','same'));
 perform save_film_plan(p.id,p.user_id,p.workspace_version,id,null,body,scenes);
 perform review_film_script(p.id,p.user_id,p.workspace_version,id,1);
 perform review_film_script(p.id,p.user_id,p.workspace_version,id,1);
 if (select count(*) from short_film_script_reviews where plan_id=id)<>1 then raise exception 'Duplicate review';end if;
 perform save_film_plan(p.id,p.user_id,p.workspace_version,id,1,body||'{"trim_speech":false}',scenes);
 if exists(select 1 from short_film_script_reviews where plan_id=id and version=2) then raise exception 'Review leaked to new revision';end if;
 if (select version from video_plan_scenes s where s.id=sid)<>1 then raise exception 'Render-only change regenerated scene';end if;
 if (select snapshot->'plan'->'story' from short_film_script_reviews where plan_id=id) <> '{"profileVersion":1}'::jsonb then raise exception 'Story review not frozen';end if;
 begin perform review_film_script(p.id,p.user_id,p.workspace_version,id,1);raise exception 'Stale review allowed';exception when others then if sqlerrm='Stale review allowed' then raise;end if;end;
 begin perform review_film_script(p.id,gen_random_uuid(),p.workspace_version,id,2);raise exception 'Foreign actor allowed';exception when others then if sqlerrm='Foreign actor allowed' then raise;end if;end;
 if has_table_privilege('authenticated','channel_profiles','UPDATE') or has_table_privilege('authenticated','short_film_script_reviews','INSERT') or has_function_privilege('authenticated','review_film_script(uuid,uuid,integer,uuid,integer)','EXECUTE') then raise exception 'Client can forge review/profile';end if;
end $$;
