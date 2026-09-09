-- Parent runs are durable work too.  A worker may retain its lease while it
-- performs a bounded local step, but every state transition is still guarded
-- by the same owner token and current workspace.
alter table public.short_film_production_runs
  add column if not exists request_fingerprint text,
  add column if not exists input_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.heartbeat_film_production_run(
  p_id uuid,
  p_owner uuid
) returns boolean
language plpgsql set search_path=public as $$
begin
  update public.short_film_production_runs r
     set lease_expires_at = now() + interval '90 seconds',
         updated_at = now()
   where r.id = p_id
     and r.lease_owner = p_owner
     and r.lease_expires_at > now()
     and r.status in ('queued','scripting','running');
  return found;
end $$;

-- `release` is explicit.  The old implementation silently released the
-- parent lease on every checkpoint, making a slow planner race a second
-- worker.
create or replace function public.checkpoint_film_production_run(
  p_id uuid,
  p_owner uuid,
  p_patch jsonb
) returns boolean
language plpgsql set search_path=public as $$
declare should_release boolean := coalesce((p_patch->>'release')::boolean, true);
begin
  update public.short_film_production_runs r set
    status=coalesce(p_patch->>'status',r.status),
    phase=coalesce(p_patch->>'phase',r.phase),
    plan_id=coalesce((p_patch->>'plan_id')::uuid,r.plan_id),
    plan_version=coalesce((p_patch->>'plan_version')::integer,r.plan_version),
    snapshot=r.snapshot||coalesce(p_patch->'snapshot','{}'::jsonb),
    input_snapshot=case when p_patch ? 'input_snapshot' then p_patch->'input_snapshot' else r.input_snapshot end,
    error=case when p_patch ? 'error' then p_patch->>'error' else r.error end,
    next_poll_at=now()+make_interval(secs=>greatest(3,least(60,coalesce((p_patch->>'delay_seconds')::integer,5)))),
    completed_at=case when p_patch->>'status' in ('completed','failed','cancelled') then now() else r.completed_at end,
    lease_owner=case when should_release then null else r.lease_owner end,
    lease_expires_at=case when should_release then null else now()+interval '90 seconds' end,
    updated_at=now()
  where r.id=p_id and r.lease_owner=p_owner and r.lease_expires_at>now()
    and exists(select 1 from public.projects p where p.id=r.project_id and p.workspace_version=r.workspace_version);
  return found;
end $$;

-- State changes are conditional, so a stale browser tab cannot resume or
-- cancel a newer state.  Server routes remain the only public caller.
create or replace function public.control_film_production_run(
  p_id uuid,
  p_actor uuid,
  p_workspace integer,
  p_action text,
  p_expected_updated_at timestamptz
) returns public.short_film_production_runs
language plpgsql set search_path=public as $$
declare r public.short_film_production_runs;
begin
  select * into r from public.short_film_production_runs
   where id=p_id and workspace_version=p_workspace for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  perform public.film_assert_access(r.project_id,p_actor,p_workspace);
  if r.created_by<>p_actor and not exists(select 1 from public.projects p where p.id=r.project_id and p.user_id=p_actor) then
    raise exception 'RUN_CONTROL_FORBIDDEN';
  end if;
  if p_expected_updated_at is not null and r.updated_at<>p_expected_updated_at then
    raise exception 'RUN_VERSION_CONFLICT';
  end if;
  if p_action='pause' and r.status in ('queued','scripting','running') then
    update public.short_film_production_runs set status='paused',lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id returning * into r;
  elsif p_action='resume' and r.status in ('paused','needs_review','budget_blocked') then
    update public.short_film_production_runs set status=case when plan_id is null then 'scripting' else 'running' end,error=null,next_poll_at=now(),completed_at=null,lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id returning * into r;
  elsif p_action='cancel' and r.status not in ('completed','cancelled') then
    update public.short_film_tasks set status='cancelled',error='Người dùng hủy trước khi gửi provider.',updated_at=now()
      where production_run_id=r.id and status='queued';
    update public.short_film_production_runs set status='cancelled',completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id returning * into r;
  else
    raise exception 'RUN_ACTION_INVALID';
  end if;
  return r;
end $$;

revoke all on function public.heartbeat_film_production_run(uuid,uuid), public.control_film_production_run(uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.heartbeat_film_production_run(uuid,uuid), public.control_film_production_run(uuid,uuid,integer,text,timestamptz) to service_role;
