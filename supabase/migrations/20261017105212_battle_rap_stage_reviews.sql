-- Chỉ bài mới đi qua từng lần chọn; bài cũ giữ cách chạy đang có.
alter table public.battle_rap_runs alter column state set default '{"review":{"version":1,"revision":0,"stage":"lyrics","approved":[],"attempts":{},"notes":{},"variants":{},"selected":{}}}'::jsonb;
alter table public.battle_rap_runs drop constraint battle_rap_runs_status_check;
alter table public.battle_rap_runs add constraint battle_rap_runs_status_check check (status in ('queued','running','awaiting_review','awaiting_music','awaiting_lyrics','needs_review','failed','cancelled','completed'));

-- Mã thao tác lưu riêng để bấm hai lần hoặc nhận lại mạng không sửa bài hai lần.
create table public.battle_rap_review_actions (
 request_id uuid primary key,
 run_id uuid not null references public.battle_rap_runs(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index battle_rap_review_actions_run on public.battle_rap_review_actions(run_id);
alter table public.battle_rap_review_actions enable row level security;
revoke all on public.battle_rap_review_actions from public,anon,authenticated;
grant all on public.battle_rap_review_actions to service_role;

create function public.edit_battle_rap_review(p_id uuid,p_project uuid,p_actor uuid,p_workspace integer,p_revision integer,p_request uuid,p_payload jsonb,p_state jsonb,p_phase text,p_status text)
returns void language plpgsql set search_path=public as $$
declare r battle_rap_runs; receipt battle_rap_review_actions; upload_action boolean;
begin
 select * into r from battle_rap_runs where id=p_id and project_id=p_project for update;
 if not found or p_workspace is null or r.workspace_version<>p_workspace or not exists(select 1 from projects p where p.id=p_project and p.workspace_version=r.workspace_version and
 (p.user_id=p_actor or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=p_actor))) then raise exception 'BATTLE_ACCESS_CHANGED'; end if;
 if p_request is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or coalesce(p_payload->>'action','') not in ('approveStage','regenerateAsset','selectVariant','regenerateText','replaceMusic','attachMusic','attachTiming') then raise exception 'BATTLE_REVIEW_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtext('battle-review:'||p_request::text));
 select * into receipt from battle_rap_review_actions where request_id=p_request;
 if found then
  if receipt.run_id=p_id and receipt.actor_id=p_actor and receipt.payload=p_payload then return; end if;
  raise exception 'BATTLE_REQUEST_REUSED';
 end if;
 if r.lease_owner is not null or r.lease_expires_at is not null then raise exception 'BATTLE_BUSY'; end if;
 if exists(select 1 from battle_rap_steps where run_id=r.id and status in ('submitting','processing','uncertain')) then raise exception 'BATTLE_BUSY'; end if;
 if r.settled then raise exception 'BATTLE_REVIEW_STALE'; end if;
 upload_action:=(p_payload->>'action'='attachMusic' and r.status='awaiting_music') or (p_payload->>'action'='attachTiming' and r.status='awaiting_lyrics');
 if r.status<>'awaiting_review' and not coalesce(upload_action,false) then raise exception 'BATTLE_REVIEW_STALE'; end if;
 if r.state#>>'{review,version}' is distinct from '1' or p_revision is null or r.state#>>'{review,revision}' is null or (r.state#>>'{review,revision}')::integer<>p_revision then raise exception 'BATTLE_REVIEW_STALE'; end if;
 if p_state#>>'{review,version}' is distinct from '1' or (p_state#>>'{review,revision}') is null or (p_state#>>'{review,revision}')::integer<>p_revision+1
 or coalesce(p_status,'') not in ('queued','awaiting_review','awaiting_music','awaiting_lyrics') or coalesce(p_phase,'') not in ('writing','music','ingest','timing','storyboard','references','excerpts','video','render') then raise exception 'BATTLE_REVIEW_INVALID'; end if;
 insert into battle_rap_review_actions(request_id,run_id,actor_id,payload) values(p_request,p_id,p_actor,p_payload);
 update battle_rap_runs set state=p_state,phase=p_phase,status=p_status,error=null,updated_at=now() where id=p_id;
end $$;
revoke all on function public.edit_battle_rap_review(uuid,uuid,uuid,integer,integer,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.edit_battle_rap_review(uuid,uuid,uuid,integer,integer,uuid,jsonb,jsonb,text,text) to service_role;

create or replace function public.checkpoint_battle_rap_run(p_id uuid,p_owner uuid,p_state jsonb,p_phase text,p_status text default 'queued',p_error text default null)
returns void language plpgsql set search_path=public as $$
declare r battle_rap_runs; remainder integer;
begin
 select * into r from battle_rap_runs where id=p_id for update;
 if not found or r.lease_owner is distinct from p_owner or r.lease_expires_at<=now() or r.status<>'running' then raise exception 'BATTLE_LEASE_LOST'; end if;
 if p_status='awaiting_review' and (p_state#>>'{review,version}' is distinct from '1' or coalesce(p_state#>>'{review,stage}','') not in ('lyrics','music','storyboard','cast','stage','scenes','clips') or coalesce(p_state#>>'{review,revision}','') !~ '^[0-9]+$') then raise exception 'BATTLE_REVIEW_INVALID'; end if;
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

create or replace function public.control_battle_rap_run(p_id uuid,p_project uuid,p_actor uuid,p_action text,p_request uuid,p_new_budget integer default null)
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
  if r.status not in ('failed','needs_review') and not (p_action='increase_budget' and r.status='awaiting_review') then raise exception 'BATTLE_RESUME_INVALID'; end if;
  if exists(select 1 from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain')) then raise exception 'BATTLE_SUBMISSION_UNCERTAIN'; end if;
  if p_action='increase_budget' and (p_new_budget is null or p_new_budget<=r.budget_points or p_new_budget>100000) then raise exception 'BATTLE_BUDGET_INVALID'; end if;
  remainder:=case when r.settled then r.budget_points-r.points_used else 0 end + case when p_action='increase_budget' then p_new_budget-r.budget_points else 0 end;
  if remainder>0 then
    payment:=atomic_deduct_project_points(r.project_id,p_actor,remainder,'Giữ mức chi làm tiếp bài rap',p_request,'battle_rap',jsonb_build_object('runId',r.id));
    if payment->>'success'<>'true' then raise exception 'INSUFFICIENT_POINTS'; end if;
  end if;
  update battle_rap_runs set status=case when r.status='awaiting_review' then 'awaiting_review' else 'queued' end,settled=false,budget_points=case when p_action='increase_budget' then p_new_budget else budget_points end,settlement_id=gen_random_uuid(),error=null,lease_owner=null,lease_expires_at=null,updated_at=now() where id=p_id;
 else raise exception 'BATTLE_ACTION_INVALID'; end if;
end $$;

-- Cho người dùng bảy ngày để chọn, nhưng hoàn ngay nếu không còn quyền vào kênh.
create or replace function public.sweep_battle_rap_runs() returns integer language plpgsql set search_path=public as $$
declare r battle_rap_runs; n integer:=0; remainder integer;
begin
 for r in select * from battle_rap_runs b where not settled and
 (lease_expires_at is null or lease_expires_at<now()) and
 (updated_at<now()-case when status in ('awaiting_review','awaiting_music','awaiting_lyrics') then interval '7 days' else interval '24 hours' end or not exists(select 1 from projects p where p.id=b.project_id and p.workspace_version=b.workspace_version and
 (p.user_id=b.created_by or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=b.created_by))))
 for update skip locked loop
  -- Không giữ phí một lượt chưa có kết quả sau thời hạn đối chiếu.
  update battle_rap_runs set points_used=points_used-coalesce((select sum(points) from battle_rap_steps where run_id=r.id and status in ('submitting','uncertain','processing')),0) where id=r.id;
  update battle_rap_steps set points=0 where run_id=r.id and status in ('submitting','uncertain','processing');
  select budget_points-points_used into remainder from battle_rap_runs where id=r.id;
  if remainder>0 then perform atomic_refund_project_points(r.project_id,r.created_by,remainder,'Hoàn mức chi bài rap bị gián đoạn',r.settlement_id,'battle_rap_refund',jsonb_build_object('runId',r.id)); end if;
  update battle_rap_runs set status='failed',settled=true,refunded_points=refunded_points+remainder,error=case when r.status in ('awaiting_review','awaiting_music','awaiting_lyrics') then 'Đã chờ bạn chọn quá 7 ngày hoặc quyền vào kênh đã đổi. Phần điểm chưa dùng đã hoàn.' else 'Bài bị gián đoạn quá lâu hoặc quyền vào kênh đã đổi.' end,lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;
