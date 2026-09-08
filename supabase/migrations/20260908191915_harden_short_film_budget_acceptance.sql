-- Recheck budget when a quote is accepted, not only when it is created. This
-- closes the window where another run could commit the daily allowance while
-- a quote is waiting for acceptance.
create function public.film_quote_accept_budget_guard() returns trigger
language plpgsql set search_path=public as $$
declare r short_film_production_runs; used integer;
begin
  if old.accepted_key is not null or new.accepted_key is null or new.production_run_id is null then
    return new;
  end if;
  select * into r from short_film_production_runs where id=new.production_run_id for update;
  if not found or r.project_id<>new.project_id or r.plan_id is distinct from new.plan_id or r.plan_version is distinct from new.plan_version then
    raise exception 'RUN_QUOTE_MISMATCH';
  end if;
  if r.status not in ('queued','scripting','running') then
    raise exception 'PRODUCTION_RUN_NOT_ACTIVE';
  end if;
  select coalesce(sum(q.points),0) into used
    from short_film_quotes q
    join short_film_production_runs x on x.id=q.production_run_id
    where x.project_id=r.project_id and x.budget_date=r.budget_date and q.accepted_key is not null;
  if r.points_committed+new.points>r.max_points_per_film or used+new.points>r.max_points_per_day then
    raise exception 'PRODUCTION_BUDGET_EXCEEDED';
  end if;
  return new;
end $$;
create trigger film_quote_accept_budget_guard
  before update of accepted_key on public.short_film_quotes
  for each row execute function public.film_quote_accept_budget_guard();

-- A run awaiting review still owns the project's production slot. It must be
-- resumed or cancelled explicitly before a scheduled or manual run can start.
drop index public.short_film_one_active_run;
create unique index short_film_one_active_run on public.short_film_production_runs(project_id)
  where status in ('queued','scripting','running','paused','budget_blocked','needs_review');

create or replace function public.schedule_due_film_automations() returns integer
language plpgsql set search_path=public as $$
declare s short_film_automation_settings; local_day date; chosen uuid; chosen_version integer; rid uuid; n integer:=0;
begin
  for s in select a.* from short_film_automation_settings a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
    where a.enabled and a.local_time <= (now() at time zone a.timezone)::time and a.last_schedule_date is distinct from (now() at time zone a.timezone)::date
    order by a.updated_at for update of a skip locked loop
    chosen:=null; chosen_version:=null;
    local_day:=(now() at time zone s.timezone)::date;
    if exists(select 1 from short_film_production_runs r where r.project_id=s.project_id and r.status in ('queued','scripting','running','paused','budget_blocked','needs_review')) then
      continue;
    end if;
    select v.id,v.version into chosen,chosen_version from unnest(s.queued_plan_ids) with ordinality q(id,ord)
      join video_plans v on v.id=q.id and v.project_id=s.project_id and v.workspace_version=s.workspace_version
      where v.status not in ('completed','approved','cancelled') order by q.ord limit 1;
    rid:=public.create_film_production_run(s.project_id,s.created_by,s.workspace_version,chosen,chosen_version,'',s.max_points_per_film,s.max_points_per_day,md5(s.project_id::text||local_day::text)::uuid,'scheduled',local_day);
    update short_film_automation_settings set last_schedule_date=local_day,updated_at=now(),queued_plan_ids=case when chosen is null then queued_plan_ids else array_remove(queued_plan_ids,chosen) end where project_id=s.project_id;
    n:=n+1;
  end loop;
  return n;
end $$;

create or replace function public.checkpoint_film_production_run(p_id uuid,p_owner uuid,p_patch jsonb) returns boolean
language plpgsql set search_path=public as $$
begin
  update short_film_production_runs r set
    status=coalesce(p_patch->>'status',r.status), phase=coalesce(p_patch->>'phase',r.phase),
    plan_id=coalesce((p_patch->>'plan_id')::uuid,r.plan_id), plan_version=coalesce((p_patch->>'plan_version')::integer,r.plan_version),
    snapshot=r.snapshot||coalesce(p_patch->'snapshot','{}'), error=p_patch->>'error',
    next_poll_at=now()+make_interval(secs=>greatest(3,least(60,coalesce((p_patch->>'delay_seconds')::integer,5)))),
    completed_at=case when p_patch->>'status' in ('completed','failed','cancelled') then now() else r.completed_at end,
    lease_owner=null,lease_expires_at=null,updated_at=now()
  where r.id=p_id and r.lease_owner=p_owner and r.lease_expires_at>now();
  return found;
end $$;

revoke all on function public.film_quote_accept_budget_guard() from public,anon,authenticated;
