create function public.film_production_run_rate_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if new.source='manual' and (select count(*) from short_film_production_runs where created_by=new.created_by and created_at>=now()-interval '1 minute')>=5 then
    raise exception 'PRODUCTION_RATE_LIMIT_MINUTE';
  end if;
  if (select count(*) from short_film_production_runs where created_by=new.created_by and created_at>=now()-interval '1 day')>=30 then
    raise exception 'PRODUCTION_RATE_LIMIT_DAY';
  end if;
  return new;
end $$;
create trigger film_production_run_rate_guard before insert on public.short_film_production_runs
  for each row execute function public.film_production_run_rate_guard();

create or replace function public.record_film_automatic_check(p_run uuid,p_task uuid,p_kind text,p_status text,p_evidence jsonb) returns void language plpgsql set search_path=public as $$
begin
  if p_status not in ('passed','needs_review','failed') then raise exception 'INVALID_CHECK'; end if;
  if not exists(select 1 from short_film_production_runs where id=p_run) then raise exception 'RUN_NOT_FOUND'; end if;
  if p_task is not null and not exists(select 1 from short_film_tasks t join short_film_production_runs r on r.id=p_run where t.id=p_task and t.production_run_id=p_run and t.project_id=r.project_id) then raise exception 'TASK_RUN_MISMATCH'; end if;
  if p_task is null then
    delete from short_film_automatic_checks where run_id=p_run and task_id is null and check_kind=p_kind;
  end if;
  insert into short_film_automatic_checks(run_id,task_id,check_kind,status,evidence) values(p_run,p_task,p_kind,p_status,coalesce(p_evidence,'{}'))
  on conflict(run_id,task_id,check_kind) do update set status=excluded.status,evidence=excluded.evidence,created_at=now();
  if p_task is not null and p_status='passed' then update short_film_tasks set auto_accepted_at=now() where id=p_task and status='completed'; end if;
end $$;
revoke all on function public.record_film_automatic_check(uuid,uuid,text,text,jsonb),public.film_production_run_rate_guard() from public,anon,authenticated;
grant execute on function public.record_film_automatic_check(uuid,uuid,text,text,jsonb) to service_role;
