-- Caller wraps BEGIN / ROLLBACK. Verifies idempotency, one active run, budget guard and privileges.
DO $$
declare p projects; plan_id uuid:=gen_random_uuid(); scene_id uuid:=gen_random_uuid(); run_id uuid; duplicate_id uuid; request_id uuid:=gen_random_uuid(); rejected boolean:=false; quote_a uuid; quote_b uuid; quote_c uuid;
begin
  select * into p from projects order by created_at limit 1;
  perform save_film_plan(p.id,p.user_id,p.workspace_version,plan_id,null,
    '{"title":"Production QA","brief":"QA","format":"9:16","resolution":"720p","audio_mode":"native","cast_snapshot":[],"target_duration_seconds":30}'::jsonb,
    jsonb_build_array(jsonb_build_object('id',scene_id,'scene_index',0,'cast_snapshot','[]'::jsonb,'dialogue','','action','QA','setting','QA','camera','close','duration_seconds',5,'follows_previous',false,'image_prompt','QA','motion_prompt','QA','source_mode','manual','input_hash','qa')));
  run_id:=create_film_production_run(p.id,p.user_id,p.workspace_version,plan_id,1,'',5,10,request_id,'manual',null);
  duplicate_id:=create_film_production_run(p.id,p.user_id,p.workspace_version,plan_id,1,'',5,10,request_id,'manual',null);
  if duplicate_id<>run_id then raise exception 'Run idempotency failed';end if;
  begin
    perform create_film_production_run(p.id,p.user_id,p.workspace_version,plan_id,1,'',5,10,gen_random_uuid(),'manual',null);
    raise exception 'Two active runs allowed';
  exception when unique_violation then null; end;
  begin
    insert into short_film_quotes(project_id,plan_id,plan_version,workspace_version,created_by,tasks,points,production_run_id)
    values(p.id,plan_id,1,p.workspace_version,p.user_id,'[]',6,run_id);
  exception when others then rejected:=position('PRODUCTION_BUDGET_EXCEEDED' in sqlerrm)>0; end;
  if not rejected then raise exception 'Film budget guard failed';end if;
  update short_film_production_runs set max_points_per_film=10,max_points_per_day=10 where id=run_id;
  insert into short_film_quotes(project_id,plan_id,plan_version,workspace_version,created_by,tasks,points,production_run_id)
    values(p.id,plan_id,1,p.workspace_version,p.user_id,'[]',5,run_id) returning id into quote_a;
  insert into short_film_quotes(project_id,plan_id,plan_version,workspace_version,created_by,tasks,points,production_run_id)
    values(p.id,plan_id,1,p.workspace_version,p.user_id,'[]',5,run_id) returning id into quote_b;
  insert into short_film_quotes(project_id,plan_id,plan_version,workspace_version,created_by,tasks,points,production_run_id)
    values(p.id,plan_id,1,p.workspace_version,p.user_id,'[]',1,run_id) returning id into quote_c;
  update short_film_quotes set accepted_key=gen_random_uuid() where id=quote_a;
  update short_film_quotes set accepted_key=gen_random_uuid() where id=quote_b;
  rejected:=false;
  begin
    update short_film_quotes set accepted_key=gen_random_uuid() where id=quote_c;
  exception when others then rejected:=position('PRODUCTION_BUDGET_EXCEEDED' in sqlerrm)>0; end;
  if not rejected then raise exception 'Budget changed between quote and acceptance was not rejected'; end if;
  update short_film_production_runs set status='needs_review' where id=run_id;
  begin
    perform create_film_production_run(p.id,p.user_id,p.workspace_version,plan_id,1,'',5,10,gen_random_uuid(),'manual',null);
    raise exception 'Needs-review run did not keep the project slot';
  exception when unique_violation then null; end;
  if has_table_privilege('authenticated','short_film_production_runs','INSERT')
    or has_table_privilege('authenticated','short_film_automation_settings','UPDATE')
    or has_function_privilege('authenticated','schedule_due_film_automations()','EXECUTE')
    then raise exception 'Client can mutate production system directly';end if;
end $$;
