create or replace function public.settle_film_failures() returns integer language plpgsql set search_path=public as $$
declare t short_film_tasks; n integer:=0;
begin
 update short_film_tasks pending set status='cancelled',error='Bước nguồn không hoàn tất; chưa gửi provider.' where status='queued' and
 (not exists(select 1 from projects p where p.id=pending.project_id and p.workspace_version=pending.workspace_version) or
 exists(select 1 from short_film_tasks d where d.id=any(pending.dependencies) and d.status in ('failed','cancelled')));
 for t in select * from short_film_tasks where status in ('failed','cancelled') and not(checkpoint ? 'settled') for update skip locked loop
  if t.points>0 and (not coalesce((t.checkpoint->>'submitting')::boolean,false) or coalesce((t.checkpoint->>'definitiveFailure')::boolean,false)) then
   update project_wallets set points=points+t.points,updated_at=now() where project_id=t.project_id;
   insert into project_transactions(project_id,actor_user_id,amount,type,description,status,request_id,ai_action,metadata)
    values(t.project_id,t.created_by,t.points,'refund','Hoàn điểm bước phim chưa thực hiện','completed',t.id,'short_film_refund',jsonb_build_object('task_id',t.id));
  end if;
  update short_film_tasks set checkpoint=checkpoint||'{"settled":true}'::jsonb where id=t.id;
  update generation_jobs set status=t.status,phase=t.status,error=jsonb_build_object('stage',t.error),completed_at=now() where id=t.generation_job_id;
  n:=n+1;
 end loop;
 return n;
end $$;
