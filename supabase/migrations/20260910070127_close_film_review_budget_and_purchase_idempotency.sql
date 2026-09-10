-- A review is a single, atomic decision for one output revision. Closing an
-- approved film also releases the project production slot.
delete from public.content_output_reviews a
using public.content_output_reviews b
where a.content_output_id=b.content_output_id
  and a.version=b.version
  and a.reviewer_id=b.reviewer_id
  and (a.created_at<b.created_at or (a.created_at=b.created_at and a.id<b.id));

create unique index if not exists content_output_review_actor_version
  on public.content_output_reviews(content_output_id,version,reviewer_id);

create or replace function public.review_content_output(
  p_output uuid,
  p_actor uuid,
  p_status text,
  p_note text default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
set search_path=public
as $$
declare
  o public.content_outputs;
  v_project_id uuid;
  workspace integer;
  affected_runs integer:=0;
begin
  if p_status not in ('approved','rejected') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  select * into o from public.content_outputs where id=p_output for update;
  if not found then raise exception 'OUTPUT_NOT_FOUND'; end if;
  select cs.project_id into v_project_id from public.content_sets cs where cs.id=o.content_set_id;
  select workspace_version into workspace from public.projects where id=v_project_id;
  perform public.film_assert_access(v_project_id,p_actor,workspace);
  if o.status not in ('completed','approved','rejected') then
    raise exception 'OUTPUT_NOT_COMPLETE';
  end if;
  if p_expected_version is not null and o.review_version<>p_expected_version then
    raise exception 'REVIEW_VERSION_CONFLICT';
  end if;

  insert into public.content_output_reviews(content_output_id,status,reviewer_id,note,version)
  values(o.id,p_status,p_actor,nullif(left(coalesce(p_note,''),2000),''),o.review_version)
  on conflict(content_output_id,version,reviewer_id) do update
    set status=excluded.status,note=excluded.note,created_at=now();

  update public.content_outputs
     set status=p_status,
         approved_at=case when p_status='approved' then now() else null end,
         approved_by=case when p_status='approved' then p_actor else null end
   where id=o.id;

  update public.video_plans
     set status=case when p_status='approved' then 'approved' else 'completed' end,
         updated_at=now()
   where latest_content_output_id=o.id;

  if p_status='approved' then
    update public.short_film_production_runs r
       set status='completed',phase='ready_review',error=null,completed_at=now(),
           lease_owner=null,lease_expires_at=null,
           snapshot=r.snapshot||jsonb_build_object(
             'outputId',o.id,
             'humanReview',jsonb_build_object('status','approved','version',o.review_version,'reviewerId',p_actor,'reviewedAt',now())
           ),updated_at=now()
     where r.project_id=v_project_id
       and r.status in ('needs_review','completed')
       and exists(
         select 1 from public.video_plans v
          where v.id=r.plan_id and v.latest_content_output_id=o.id
       );
    get diagnostics affected_runs=row_count;
  end if;

  return jsonb_build_object(
    'id',o.id,'status',p_status,'reviewVersion',o.review_version,
    'productionRunsClosed',affected_runs
  );
end $$;

create or replace function public.approve_film_task(
  p_task uuid,p_project uuid,p_actor uuid,p_workspace integer
) returns void language plpgsql set search_path=public as $$
declare t short_film_tasks; output_id uuid;
begin
  perform film_assert_access(p_project,p_actor,p_workspace);
  select * into t from short_film_tasks where id=p_task and project_id=p_project and workspace_version=p_workspace for update;
  if not found or t.status<>'completed' then raise exception 'RESULT_NOT_READY'; end if;
  insert into short_film_reviews(task_id,reviewer_id) values(t.id,p_actor) on conflict do nothing;
  update short_film_tasks set approved_by=p_actor,approved_at=now() where id=t.id;
  if t.input->>'voiceVersionId' is not null then
    update character_voice_versions set approved_by=p_actor,approved_at=now(),sample_task_id=t.id
      where id=(t.input->>'voiceVersionId')::uuid and project_id=p_project and workspace_version=p_workspace;
  end if;
  if t.kind='render' then
    output_id:=nullif(t.result->>'outputId','')::uuid;
    if output_id is null then raise exception 'OUTPUT_NOT_FOUND'; end if;
    perform public.review_content_output(output_id,p_actor,'approved',null,null);
  end if;
end $$;

-- Waiting for a person's review must not monopolize the only production slot.
drop index if exists public.short_film_one_active_run;
create unique index short_film_one_active_run on public.short_film_production_runs(project_id)
  where status in ('queued','scripting','running','paused','budget_blocked');

create or replace function public.schedule_due_film_automations() returns integer
language plpgsql set search_path=public as $$
declare s short_film_automation_settings; local_day date; chosen uuid; chosen_version integer; rid uuid; n integer:=0;
begin
  for s in select a.* from short_film_automation_settings a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
    where a.enabled and a.local_time <= (now() at time zone a.timezone)::time and a.last_schedule_date is distinct from (now() at time zone a.timezone)::date
    order by a.updated_at for update of a skip locked loop
    chosen:=null; chosen_version:=null;
    local_day:=(now() at time zone s.timezone)::date;
    if exists(select 1 from short_film_production_runs r where r.project_id=s.project_id and r.status in ('queued','scripting','running','paused','budget_blocked')) then
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

-- Resume can raise or lower the cap in the same locked state transition.
create or replace function public.control_film_production_run_v2(
  p_id uuid,
  p_actor uuid,
  p_workspace integer,
  p_action text,
  p_expected_updated_at timestamptz,
  p_max_film integer default null,
  p_max_day integer default null
) returns public.short_film_production_runs
language plpgsql set search_path=public as $$
declare
  r public.short_film_production_runs;
  owner_id uuid;
  next_film integer;
  next_day integer;
  day_committed integer;
begin
  select * into r from public.short_film_production_runs
   where id=p_id and workspace_version=p_workspace for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  perform public.film_assert_access(r.project_id,p_actor,p_workspace);
  select user_id into owner_id from public.projects where id=r.project_id;
  if r.created_by<>p_actor and owner_id<>p_actor then raise exception 'RUN_CONTROL_FORBIDDEN'; end if;
  if p_expected_updated_at is not null and r.updated_at<>p_expected_updated_at then raise exception 'RUN_VERSION_CONFLICT'; end if;

  next_film:=coalesce(p_max_film,r.max_points_per_film);
  next_day:=coalesce(p_max_day,r.max_points_per_day);
  if (p_max_film is null)<>(p_max_day is null) or next_film<=0 or next_day<next_film then
    raise exception 'INVALID_BUDGET';
  end if;
  if (next_film>r.max_points_per_film or next_day>r.max_points_per_day) and owner_id<>p_actor then
    raise exception 'OWNER_REQUIRED';
  end if;
  select coalesce(sum(q.points),0) into day_committed
    from public.short_film_quotes q
    join public.short_film_production_runs x on x.id=q.production_run_id
   where x.project_id=r.project_id and x.budget_date=r.budget_date and q.accepted_key is not null;
  if next_film<r.points_committed or next_day<day_committed then raise exception 'BUDGET_BELOW_COMMITTED'; end if;

  if p_action='pause' and r.status in ('queued','scripting','running') then
    update public.short_film_production_runs set status='paused',lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id returning * into r;
  elsif p_action='resume' and r.status in ('paused','needs_review','budget_blocked') then
    update public.short_film_production_runs set
      status=case when plan_id is null then 'scripting' else 'running' end,
      max_points_per_film=next_film,max_points_per_day=next_day,
      error=null,next_poll_at=now(),completed_at=null,lease_owner=null,lease_expires_at=null,updated_at=now()
    where id=r.id returning * into r;
  elsif p_action='cancel' and r.status not in ('completed','cancelled') then
    update public.short_film_tasks set status='cancelled',error='Người dùng hủy trước khi gửi provider.',updated_at=now()
      where production_run_id=r.id and status='queued';
    update public.short_film_production_runs set status='cancelled',completed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where id=r.id returning * into r;
  else
    raise exception 'RUN_ACTION_INVALID';
  end if;
  return r;
end $$;

-- A stable client key makes a lost HTTP response safe to retry.
create table if not exists public.point_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  package_id text not null,
  price numeric not null check(price>0),
  points integer not null check(points>0),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
alter table public.point_purchase_receipts enable row level security;
revoke all on public.point_purchase_receipts from public,anon,authenticated;
grant all on public.point_purchase_receipts to service_role;

create or replace function public.buy_points_idempotent(
  p_user uuid,p_key uuid,p_package text,p_price numeric,p_points integer,p_description text
) returns jsonb
language plpgsql set search_path=public as $$
declare receipt public.point_purchase_receipts; purchase jsonb;
begin
  if p_key is null or p_price<=0 or p_points<=0 or coalesce(p_package,'')='' then raise exception 'INVALID_PURCHASE'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text||':'||p_key::text));
  select * into receipt from public.point_purchase_receipts where user_id=p_user and idempotency_key=p_key;
  if found then
    if receipt.package_id<>p_package or receipt.price<>p_price or receipt.points<>p_points then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return receipt.result||jsonb_build_object('duplicate',true);
  end if;
  purchase:=public.atomic_buy_points(p_user,p_price,p_points,p_description);
  if coalesce((purchase->>'success')::boolean,false) then
    insert into public.point_purchase_receipts(user_id,idempotency_key,package_id,price,points,result)
    values(p_user,p_key,p_package,p_price,p_points,purchase);
  end if;
  return purchase;
end $$;

revoke all on function public.review_content_output(uuid,uuid,text,text,integer),
  public.control_film_production_run_v2(uuid,uuid,integer,text,timestamptz,integer,integer),
  public.buy_points_idempotent(uuid,uuid,text,numeric,integer,text),
  public.approve_film_task(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.review_content_output(uuid,uuid,text,text,integer),
  public.control_film_production_run_v2(uuid,uuid,integer,text,timestamptz,integer,integer),
  public.buy_points_idempotent(uuid,uuid,text,numeric,integer,text),
  public.approve_film_task(uuid,uuid,uuid,integer) to service_role;
