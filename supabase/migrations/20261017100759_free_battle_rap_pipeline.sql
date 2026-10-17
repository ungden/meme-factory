create table public.battle_rap_runs (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 workspace_version integer not null,
 created_by uuid not null references auth.users(id),
 input jsonb not null,
 state jsonb not null default '{}'::jsonb,
 phase text not null default 'writing' check (phase in ('writing','music','ingest','timing','storyboard','references','excerpts','video','render','done')),
 status text not null default 'queued' check (status in ('queued','running','awaiting_music','awaiting_lyrics','needs_review','failed','cancelled','completed')),
 budget_points integer not null check (budget_points between 1 and 100000),
 points_used integer not null default 0 check (points_used >= 0 and points_used <= budget_points),
 refunded_points integer not null default 0,
 settled boolean not null default false,
 settlement_id uuid not null default gen_random_uuid(),
 lease_owner uuid,
 lease_expires_at timestamptz,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index battle_rap_claim on public.battle_rap_runs(updated_at) where status in ('queued','running');
create table public.battle_rap_steps (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.battle_rap_runs(id) on delete cascade,
 step_key text not null,
 status text not null check (status in ('submitting','processing','completed','failed','uncertain')),
 points integer not null check (points >= 0),
 provider_id text,
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(run_id,step_key)
);
alter table public.battle_rap_runs enable row level security;
alter table public.battle_rap_steps enable row level security;
revoke all on public.battle_rap_runs, public.battle_rap_steps from anon, authenticated;
grant select on public.battle_rap_runs, public.battle_rap_steps to authenticated;
grant all on public.battle_rap_runs, public.battle_rap_steps to service_role;
create policy battle_rap_read on public.battle_rap_runs for select to authenticated using (
 exists(select 1 from public.projects p where p.id=project_id and p.workspace_version=battle_rap_runs.workspace_version
 and (p.user_id=(select auth.uid()) or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=(select auth.uid()))))
);
create policy battle_rap_step_read on public.battle_rap_steps for select to authenticated using (
 exists(select 1 from public.battle_rap_runs r where r.id=run_id)
);

-- Giữ mức chi và ghi việc trong cùng giao dịch; không có khoản trừ mồ côi.
create function public.create_battle_rap_run(p_id uuid,p_project uuid,p_actor uuid,p_workspace integer,p_input jsonb,p_budget integer)
returns uuid language plpgsql set search_path=public as $$
declare r battle_rap_runs; payment jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('battle:'||p_id::text));
 perform pg_advisory_xact_lock(hashtext(p_id::text));
 if not exists(select 1 from projects p where p.id=p_project and p.workspace_version=p_workspace and
 (p.user_id=p_actor or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=p_actor))) then raise exception 'BATTLE_ACCESS_CHANGED'; end if;
 select * into r from battle_rap_runs where id=p_id;
 if found then
  if r.project_id<>p_project or r.created_by<>p_actor then raise exception 'BATTLE_ACCESS_CHANGED'; end if;
  return r.id;
 end if;
 if exists(select 1 from project_transactions where request_id=p_id) then raise exception 'BATTLE_REQUEST_REUSED'; end if;
 if p_budget not between 1 and 100000 then raise exception 'BATTLE_BUDGET_INVALID'; end if;
 payment:=atomic_deduct_project_points(p_project,p_actor,p_budget,'Giữ mức chi bài rap',p_id,'battle_rap',jsonb_build_object('reservation',true));
 if payment->>'success'<>'true' then raise exception 'INSUFFICIENT_POINTS'; end if;
 insert into battle_rap_runs(id,project_id,created_by,workspace_version,input,budget_points) values(p_id,p_project,p_actor,p_workspace,p_input,p_budget);
 return p_id;
end $$;

create function public.claim_battle_rap_run() returns setof public.battle_rap_runs language plpgsql set search_path=public as $$
declare picked uuid;
begin
 select b.id into picked from battle_rap_runs b where status in ('queued','running') and
 exists(select 1 from projects p where p.id=b.project_id and p.workspace_version=b.workspace_version and
 (p.user_id=b.created_by or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=b.created_by))) and
 (lease_expires_at is null or lease_expires_at<now()) order by updated_at for update skip locked limit 1;
 if picked is null then return; end if;
 return query update battle_rap_runs set status='running',lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',updated_at=now() where id=picked returning *;
end $$;

create function public.heartbeat_battle_rap_run(p_id uuid,p_owner uuid) returns boolean language plpgsql set search_path=public as $$
begin
 update battle_rap_runs set lease_expires_at=now()+interval '5 minutes' where id=p_id and lease_owner=p_owner and lease_expires_at>now() and status='running';
 return found;
end $$;

create function public.begin_battle_rap_step(p_run uuid,p_owner uuid,p_key text,p_points integer) returns public.battle_rap_steps language plpgsql set search_path=public as $$
declare r battle_rap_runs; s battle_rap_steps;
begin
 select * into r from battle_rap_runs where id=p_run for update;
 if not found or r.lease_owner is distinct from p_owner or r.lease_expires_at<=now() or r.status<>'running' then raise exception 'BATTLE_LEASE_LOST'; end if;
 select * into s from battle_rap_steps where run_id=p_run and step_key=p_key;
 if found and s.status<>'failed' then return s; end if;
 if p_points<0 or r.points_used+p_points>r.budget_points then raise exception 'BATTLE_BUDGET_EXCEEDED'; end if;
 insert into battle_rap_steps(run_id,step_key,status,points) values(p_run,p_key,'submitting',p_points)
 on conflict(run_id,step_key) do update set status='submitting',points=excluded.points,provider_id=null,result=null,updated_at=now() returning * into s;
 update battle_rap_runs set points_used=points_used+p_points where id=p_run;
 return s;
end $$;

create function public.save_battle_rap_step(p_run uuid,p_owner uuid,p_key text,p_status text,p_result jsonb,p_provider text default null)
returns void language plpgsql set search_path=public as $$
declare r battle_rap_runs; s battle_rap_steps;
begin
 select * into r from battle_rap_runs where id=p_run for update;
 if not found or r.lease_owner is distinct from p_owner or r.lease_expires_at<=now() or r.status<>'running' then raise exception 'BATTLE_LEASE_LOST'; end if;
 if p_status not in ('processing','completed','failed','uncertain') then raise exception 'BATTLE_STEP_STATUS_INVALID'; end if;
 select * into s from battle_rap_steps where run_id=p_run and step_key=p_key for update;
 if not found then raise exception 'BATTLE_STEP_MISSING'; end if;
 if s.status='completed' then return; end if;
 if p_status='failed' and s.status<>'failed' then
  update battle_rap_runs set points_used=points_used-s.points where id=p_run;
 end if;
 update battle_rap_steps set status=p_status,result=p_result,provider_id=coalesce(p_provider,provider_id),
 points=case when p_status='failed' then 0 else points end,updated_at=now() where id=s.id;
end $$;

create function public.checkpoint_battle_rap_run(p_id uuid,p_owner uuid,p_state jsonb,p_phase text,p_status text default 'queued',p_error text default null)
returns void language plpgsql set search_path=public as $$
declare r battle_rap_runs; remainder integer;
begin
 select * into r from battle_rap_runs where id=p_id for update;
 if not found or r.lease_owner is distinct from p_owner or r.lease_expires_at<=now() or r.status<>'running' then raise exception 'BATTLE_LEASE_LOST'; end if;
 if p_status in ('completed','failed','cancelled') and not r.settled then
  if p_status in ('failed','cancelled') then
   update battle_rap_runs set points_used=points_used-coalesce((select sum(points) from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain','processing')),0) where id=r.id;
   update battle_rap_steps set points=0 where run_id=r.id and status in ('submitting','uncertain','processing');
  end if;
  select budget_points-points_used into remainder from battle_rap_runs where id=r.id;
  if remainder>0 then perform atomic_refund_project_points(r.project_id,r.created_by,remainder,'Hoàn mức chi còn dư bài rap',r.settlement_id,'battle_rap_refund',jsonb_build_object('runId',r.id)); end if;
  update battle_rap_runs set settled=true,refunded_points=refunded_points+remainder where id=r.id;
 end if;
 update battle_rap_runs set state=p_state,phase=p_phase,status=p_status,error=left(p_error,1000),lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_id;
end $$;

create function public.control_battle_rap_run(p_id uuid,p_project uuid,p_actor uuid,p_action text,p_request uuid,p_new_budget integer default null)
returns void language plpgsql set search_path=public as $$
declare r battle_rap_runs; remainder integer; payment jsonb;
begin
 select * into r from battle_rap_runs where id=p_id and project_id=p_project for update;
 if not found or not exists(select 1 from projects p where p.id=p_project and p.workspace_version=r.workspace_version and
 (p.user_id=p_actor or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=p_actor))) then raise exception 'BATTLE_ACCESS_CHANGED'; end if;
 if r.lease_expires_at>now() then raise exception 'BATTLE_BUSY'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 if exists(select 1 from project_transactions where request_id=p_request and type='payment') then
  if exists(select 1 from project_transactions where request_id=p_request and project_id=p_project and metadata->>'runId'=p_id::text) then return; end if;
  raise exception 'BATTLE_REQUEST_REUSED';
 end if;
 if p_action='cancel' then
  if r.status in ('completed','cancelled') then return; end if;
  if not r.settled then
   update battle_rap_runs set points_used=points_used-coalesce((select sum(points) from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain','processing')),0) where id=r.id;
   update battle_rap_steps set points=0 where run_id=r.id and status in ('submitting','uncertain','processing');
  end if;
  select budget_points-points_used into remainder from battle_rap_runs where id=r.id;
  if not r.settled and remainder>0 then perform atomic_refund_project_points(r.project_id,r.created_by,remainder,'Hoàn mức chi bài rap đã dừng',r.settlement_id,'battle_rap_refund',jsonb_build_object('runId',r.id)); end if;
  update battle_rap_runs set status='cancelled',refunded_points=refunded_points+case when settled then 0 else remainder end,settled=true,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_id;
 elsif p_action in ('resume','increase_budget') then
  if r.status not in ('failed','needs_review') then raise exception 'BATTLE_RESUME_INVALID'; end if;
  if exists(select 1 from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain')) then raise exception 'BATTLE_SUBMISSION_UNCERTAIN'; end if;
  if p_action='increase_budget' and (p_new_budget is null or p_new_budget<=r.budget_points or p_new_budget>100000) then raise exception 'BATTLE_BUDGET_INVALID'; end if;
  remainder:=case when r.settled then r.budget_points-r.points_used else 0 end + case when p_action='increase_budget' then p_new_budget-r.budget_points else 0 end;
  if remainder>0 then
    payment:=atomic_deduct_project_points(r.project_id,p_actor,remainder,'Giữ mức chi làm tiếp bài rap',p_request,'battle_rap',jsonb_build_object('runId',r.id));
    if payment->>'success'<>'true' then raise exception 'INSUFFICIENT_POINTS'; end if;
  end if;
  update battle_rap_runs set status='queued',settled=false,budget_points=case when p_action='increase_budget' then p_new_budget else budget_points end,settlement_id=gen_random_uuid(),error=null,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_id;
 else raise exception 'BATTLE_ACTION_INVALID'; end if;
end $$;

-- Nếu worker chết hoặc kênh mất quyền, đóng việc và hoàn phần chưa dùng.
create function public.sweep_battle_rap_runs() returns integer language plpgsql set search_path=public as $$
declare r battle_rap_runs; n integer:=0; remainder integer;
begin
 for r in select * from battle_rap_runs b where not settled and
 (lease_expires_at is null or lease_expires_at<now()) and
 (updated_at<now()-interval '24 hours' or not exists(select 1 from projects p where p.id=b.project_id and p.workspace_version=b.workspace_version and
 (p.user_id=b.created_by or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=b.created_by))))
 for update skip locked loop
  -- Không giữ phí một lượt chưa có kết quả sau thời hạn đối chiếu.
  update battle_rap_runs set points_used=points_used-coalesce((select sum(points) from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain','processing')),0) where id=r.id;
  update battle_rap_steps set points=0 where run_id=r.id and status in ('submitting','uncertain','processing');
  select budget_points-points_used into remainder from battle_rap_runs where id=r.id;
  if remainder>0 then perform atomic_refund_project_points(r.project_id,r.created_by,remainder,'Hoàn mức chi bài rap bị gián đoạn',r.settlement_id,'battle_rap_refund',jsonb_build_object('runId',r.id)); end if;
  update battle_rap_runs set status='failed',settled=true,refunded_points=refunded_points+remainder,error='Bài bị gián đoạn quá lâu hoặc quyền vào kênh đã đổi.',lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;

revoke all on function public.create_battle_rap_run(uuid,uuid,uuid,integer,jsonb,integer),public.claim_battle_rap_run(),public.heartbeat_battle_rap_run(uuid,uuid),public.begin_battle_rap_step(uuid,uuid,text,integer),public.save_battle_rap_step(uuid,uuid,text,text,jsonb,text),public.checkpoint_battle_rap_run(uuid,uuid,jsonb,text,text,text),public.control_battle_rap_run(uuid,uuid,uuid,text,uuid,integer),public.sweep_battle_rap_runs() from public,anon,authenticated;
grant execute on function public.create_battle_rap_run(uuid,uuid,uuid,integer,jsonb,integer),public.claim_battle_rap_run(),public.heartbeat_battle_rap_run(uuid,uuid),public.begin_battle_rap_step(uuid,uuid,text,integer),public.save_battle_rap_step(uuid,uuid,text,text,jsonb,text),public.checkpoint_battle_rap_run(uuid,uuid,jsonb,text,text,text),public.control_battle_rap_run(uuid,uuid,uuid,text,uuid,integer),public.sweep_battle_rap_runs() to service_role;
