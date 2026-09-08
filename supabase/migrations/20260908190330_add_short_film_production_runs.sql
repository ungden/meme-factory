create table public.short_film_automation_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  workspace_version integer not null,
  enabled boolean not null default false,
  local_time time not null default '09:00',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  films_per_day integer not null default 1 check (films_per_day = 1),
  max_points_per_film integer not null check (max_points_per_film > 0),
  max_points_per_day integer not null check (max_points_per_day > 0),
  queued_plan_ids uuid[] not null default '{}',
  default_config jsonb not null default '{"duration":35,"format":"9:16","resolution":"720p","audioMode":"fixed","subtitles":true}',
  created_by uuid not null references auth.users(id) on delete restrict,
  last_schedule_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.short_film_production_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_version integer not null,
  plan_id uuid references public.video_plans(id) on delete set null,
  plan_version integer,
  source text not null check (source in ('manual','scheduled')),
  intent text not null default '',
  status text not null default 'queued' check (status in ('queued','scripting','running','paused','budget_blocked','needs_review','completed','failed','cancelled')),
  phase text not null default 'script',
  max_points_per_film integer not null check (max_points_per_film > 0),
  max_points_per_day integer not null check (max_points_per_day > 0),
  points_committed integer not null default 0 check (points_committed >= 0),
  budget_date date not null,
  idempotency_key uuid not null,
  scheduler_date date,
  snapshot jsonb not null default '{}',
  error text,
  created_by uuid not null references auth.users(id) on delete restrict,
  lease_owner uuid,
  lease_expires_at timestamptz,
  next_poll_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(project_id,idempotency_key),
  unique(project_id,scheduler_date)
);
create unique index short_film_one_active_run on public.short_film_production_runs(project_id)
  where status in ('queued','scripting','running','paused','budget_blocked');
create index short_film_run_claim on public.short_film_production_runs(status,next_poll_at,lease_expires_at,created_at);
create index short_film_run_history on public.short_film_production_runs(project_id,created_at desc);

create table public.short_film_automatic_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.short_film_production_runs(id) on delete cascade,
  task_id uuid references public.short_film_tasks(id) on delete cascade,
  check_kind text not null,
  status text not null check (status in ('passed','needs_review','failed')),
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(run_id,task_id,check_kind)
);

alter table public.short_film_quotes add column production_run_id uuid references public.short_film_production_runs(id) on delete set null;
alter table public.short_film_tasks add column production_run_id uuid references public.short_film_production_runs(id) on delete set null,
  add column auto_accepted_at timestamptz;

alter table public.short_film_automation_settings enable row level security;
alter table public.short_film_production_runs enable row level security;
alter table public.short_film_automatic_checks enable row level security;
revoke all on public.short_film_automation_settings,public.short_film_production_runs,public.short_film_automatic_checks from public,anon,authenticated;
grant select on public.short_film_automation_settings,public.short_film_production_runs,public.short_film_automatic_checks to authenticated;
grant all on public.short_film_automation_settings,public.short_film_production_runs,public.short_film_automatic_checks to service_role;
create policy short_film_automation_read on public.short_film_automation_settings for select to authenticated using (
  project_id in (select id from public.projects)
);
create policy short_film_runs_read on public.short_film_production_runs for select to authenticated using (
  project_id in (select id from public.projects)
);
create policy short_film_checks_read on public.short_film_automatic_checks for select to authenticated using (
  run_id in (select id from public.short_film_production_runs)
);

create function public.create_film_production_run(
  p_project uuid,p_actor uuid,p_workspace integer,p_plan uuid,p_plan_version integer,
  p_intent text,p_max_film integer,p_max_day integer,p_key uuid,p_source text default 'manual',p_schedule_date date default null
) returns uuid language plpgsql set search_path=public as $$
declare rid uuid; owner_id uuid; local_day date;
begin
  perform public.film_assert_access(p_project,p_actor,p_workspace);
  if p_max_film<=0 or p_max_day<p_max_film then raise exception 'INVALID_BUDGET'; end if;
  if p_source not in ('manual','scheduled') then raise exception 'INVALID_SOURCE'; end if;
  select user_id into owner_id from projects where id=p_project;
  if p_source='scheduled' and owner_id<>p_actor then raise exception 'OWNER_REQUIRED'; end if;
  if p_plan is not null and not exists(select 1 from video_plans where id=p_plan and project_id=p_project and workspace_version=p_workspace and version=p_plan_version) then raise exception 'PLAN_VERSION_CHANGED'; end if;
  local_day:=coalesce(p_schedule_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
  insert into short_film_production_runs(project_id,workspace_version,plan_id,plan_version,source,intent,status,phase,max_points_per_film,max_points_per_day,budget_date,idempotency_key,scheduler_date,created_by)
  values(p_project,p_workspace,p_plan,p_plan_version,p_source,left(coalesce(p_intent,''),4000),case when p_plan is null then 'scripting' else 'queued' end,case when p_plan is null then 'script' else 'prepare' end,p_max_film,p_max_day,local_day,p_key,p_schedule_date,p_actor)
  on conflict(project_id,idempotency_key) do nothing returning id into rid;
  if rid is null then select id into rid from short_film_production_runs where project_id=p_project and idempotency_key=p_key; end if;
  return rid;
end $$;

create function public.schedule_due_film_automations() returns integer language plpgsql set search_path=public as $$
declare s short_film_automation_settings; local_day date; chosen uuid; chosen_version integer; rid uuid; n integer:=0;
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
    rid:=public.create_film_production_run(s.project_id,s.created_by,s.workspace_version,chosen,chosen_version,'',s.max_points_per_film,s.max_points_per_day,md5(s.project_id::text||local_day::text)::uuid,'scheduled',local_day);
    update short_film_automation_settings set last_schedule_date=local_day,updated_at=now(),queued_plan_ids=case when chosen is null then queued_plan_ids else array_remove(queued_plan_ids,chosen) end where project_id=s.project_id;
    n:=n+1;
  end loop;
  return n;
end $$;

create function public.claim_film_production_runs(p_limit integer default 1) returns setof short_film_production_runs language plpgsql set search_path=public as $$
declare r short_film_production_runs; n integer:=0;
begin
  if p_limit<1 or p_limit>4 then raise exception 'INVALID_LIMIT'; end if;
  for r in select x.* from short_film_production_runs x join projects p on p.id=x.project_id and p.workspace_version=x.workspace_version
    where x.status in ('queued','scripting','running') and x.next_poll_at<=now() and (x.lease_expires_at is null or x.lease_expires_at<=now())
    order by x.next_poll_at,x.created_at for update of x skip locked loop
    exit when n>=p_limit;
    update short_film_production_runs set lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',updated_at=now() where id=r.id returning * into r;
    n:=n+1; return next r;
  end loop;
end $$;

create function public.checkpoint_film_production_run(p_id uuid,p_owner uuid,p_patch jsonb) returns boolean language plpgsql set search_path=public as $$
begin
  update short_film_production_runs r set
    status=coalesce(p_patch->>'status',r.status), phase=coalesce(p_patch->>'phase',r.phase),
    plan_id=coalesce((p_patch->>'plan_id')::uuid,r.plan_id), plan_version=coalesce((p_patch->>'plan_version')::integer,r.plan_version),
    snapshot=r.snapshot||coalesce(p_patch->'snapshot','{}'), error=p_patch->>'error',
    next_poll_at=now()+make_interval(secs=>greatest(3,least(60,coalesce((p_patch->>'delay_seconds')::integer,5)))),
    completed_at=case when p_patch->>'status' in ('completed','failed','cancelled','needs_review') then now() else r.completed_at end,
    lease_owner=null,lease_expires_at=null,updated_at=now()
  where r.id=p_id and r.lease_owner=p_owner and r.lease_expires_at>now();
  return found;
end $$;

create function public.record_film_automatic_check(p_run uuid,p_task uuid,p_kind text,p_status text,p_evidence jsonb) returns void language plpgsql set search_path=public as $$
begin
  if p_status not in ('passed','needs_review','failed') then raise exception 'INVALID_CHECK'; end if;
  if not exists(select 1 from short_film_tasks t join short_film_production_runs r on r.id=p_run where t.id=p_task and t.production_run_id=p_run and t.project_id=r.project_id) then raise exception 'TASK_RUN_MISMATCH'; end if;
  insert into short_film_automatic_checks(run_id,task_id,check_kind,status,evidence) values(p_run,p_task,p_kind,p_status,coalesce(p_evidence,'{}'))
  on conflict(run_id,task_id,check_kind) do update set status=excluded.status,evidence=excluded.evidence,created_at=now();
  if p_status='passed' then update short_film_tasks set auto_accepted_at=now() where id=p_task and status='completed'; end if;
end $$;

create function public.film_quote_budget_guard() returns trigger language plpgsql set search_path=public as $$
declare r short_film_production_runs; used integer;
begin
  if new.production_run_id is null then return new; end if;
  select * into r from short_film_production_runs where id=new.production_run_id for update;
  if not found or r.project_id<>new.project_id or r.plan_id is distinct from new.plan_id or r.plan_version is distinct from new.plan_version then raise exception 'RUN_QUOTE_MISMATCH'; end if;
  select coalesce(sum(q.points),0) into used from short_film_quotes q join short_film_production_runs x on x.id=q.production_run_id
    where x.project_id=r.project_id and x.budget_date=r.budget_date and q.accepted_key is not null;
  if r.points_committed+new.points>r.max_points_per_film or used+new.points>r.max_points_per_day then raise exception 'PRODUCTION_BUDGET_EXCEEDED'; end if;
  return new;
end $$;
create trigger film_quote_budget_guard before insert on public.short_film_quotes for each row execute function public.film_quote_budget_guard();

create function public.film_quote_attach_run() returns trigger language plpgsql set search_path=public as $$
begin
  if old.accepted_key is null and new.accepted_key is not null and new.production_run_id is not null then
    update short_film_tasks set production_run_id=new.production_run_id where run_id=new.accepted_key and project_id=new.project_id;
    update short_film_production_runs set points_committed=points_committed+new.points,updated_at=now() where id=new.production_run_id;
  end if;
  return new;
end $$;
create trigger film_quote_attach_run after update of accepted_key on public.short_film_quotes for each row execute function public.film_quote_attach_run();

revoke all on function public.create_film_production_run(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date), public.schedule_due_film_automations(), public.claim_film_production_runs(integer), public.checkpoint_film_production_run(uuid,uuid,jsonb), public.record_film_automatic_check(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_film_production_run(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date), public.schedule_due_film_automations(), public.claim_film_production_runs(integer), public.checkpoint_film_production_run(uuid,uuid,jsonb), public.record_film_automatic_check(uuid,uuid,text,text,jsonb) to service_role;
