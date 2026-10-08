-- Meme do kênh tự sản xuất: mỗi lượt làm đúng một meme ở phía server, từ ý
-- tưởng tới ảnh đã lưu trong thư viện. Trước đây ảnh chỉ được lưu khi trình
-- duyệt còn mở sau lúc tạo, nên đóng tab là mất ảnh đã trả điểm, và không có
-- cách nào để kênh tự ra meme đều đặn.

create table public.meme_production_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_version integer not null,
  source text not null check (source in ('manual','scheduled')),
  intent text not null default '',
  options jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  phase text not null default 'queued',
  -- Chữ đã viết được giữ lại: lần chạy tiếp sau khi tiến trình chết không viết lại ý tưởng khác.
  checkpoint jsonb not null default '{}',
  meme_id uuid references public.memes(id) on delete set null,
  error text,
  attempts integer not null default 0,
  idempotency_key uuid not null,
  scheduler_date date,
  lease_owner uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, idempotency_key)
);
create index meme_runs_claim on public.meme_production_runs(status, next_attempt_at) where status in ('queued','running');
create index meme_runs_project on public.meme_production_runs(project_id, created_at desc);

create table public.meme_automation_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  workspace_version integer not null,
  enabled boolean not null default false,
  local_time time not null default '09:00',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  memes_per_day integer not null default 1 check (memes_per_day between 1 and 10),
  options jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meme_production_runs enable row level security;
alter table public.meme_automation_settings enable row level security;
-- Supabase cấp sẵn mọi quyền cho bảng mới ở schema public; thu hồi để client
-- chỉ đọc được, mọi thao tác ghi đi qua route dùng service role.
revoke all on public.meme_production_runs, public.meme_automation_settings from anon, authenticated;
grant select on public.meme_production_runs, public.meme_automation_settings to authenticated;
grant all on public.meme_production_runs, public.meme_automation_settings to service_role;
-- Đọc theo quyền xem dự án; mọi thao tác ghi đi qua route dùng service role.
create policy meme_runs_read on public.meme_production_runs for select to authenticated using (
  project_id in (select id from public.projects)
);
create policy meme_automation_read on public.meme_automation_settings for select to authenticated using (
  project_id in (select id from public.projects)
);

create function public.create_meme_production_run(
  p_project uuid, p_actor uuid, p_workspace integer, p_intent text, p_options jsonb,
  p_key uuid, p_source text, p_schedule_date date
) returns uuid language plpgsql set search_path=public as $$
declare rid uuid; owner_id uuid; prior meme_production_runs;
begin
  perform film_assert_access(p_project,p_actor,p_workspace);
  if p_source not in ('manual','scheduled') then raise exception 'INVALID_SOURCE'; end if;
  select user_id into owner_id from projects where id=p_project;
  if p_source='scheduled' and owner_id<>p_actor then raise exception 'OWNER_REQUIRED'; end if;
  insert into meme_production_runs(project_id,workspace_version,source,intent,options,idempotency_key,scheduler_date,created_by)
    values(p_project,p_workspace,p_source,left(coalesce(p_intent,''),2000),coalesce(p_options,'{}'::jsonb),p_key,p_schedule_date,p_actor)
    on conflict(project_id,idempotency_key) do nothing returning id into rid;
  if rid is null then
    select * into prior from meme_production_runs where project_id=p_project and idempotency_key=p_key;
    if prior.intent is distinct from left(coalesce(p_intent,''),2000) or prior.options is distinct from coalesce(p_options,'{}'::jsonb)
      then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    rid:=prior.id;
  end if;
  return rid;
end $$;

-- Lease ngắn hơn thời gian tối đa của một lần tạo ảnh cộng lưu; lượt bị bỏ dở
-- được nhận lại sau khi lease hết. Ba lần hỏng thì dừng hẳn để không đốt điểm.
create function public.claim_meme_production_runs(p_limit integer default 1, p_run uuid default null)
returns setof meme_production_runs language plpgsql set search_path=public as $$
declare r meme_production_runs; n integer:=0;
begin
  if p_limit<1 or p_limit>4 then raise exception 'INVALID_LIMIT'; end if;
  update meme_production_runs set status='failed',error=coalesce(error,'MEME_RUN_GAVE_UP'),completed_at=now(),updated_at=now()
    where status in ('queued','running') and attempts>=3 and (lease_expires_at is null or lease_expires_at<=now());
  for r in select x.* from meme_production_runs x join projects p on p.id=x.project_id and p.workspace_version=x.workspace_version
    where x.status in ('queued','running') and x.next_attempt_at<=now() and (x.lease_expires_at is null or x.lease_expires_at<=now())
      and (p_run is null or x.id=p_run)
    order by x.next_attempt_at,x.created_at for update of x skip locked loop
    exit when n>=p_limit;
    update meme_production_runs set status='running',lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '4 minutes',
      attempts=attempts+1,updated_at=now() where id=r.id returning * into r;
    n:=n+1; return next r;
  end loop;
end $$;

create function public.schedule_due_meme_automations() returns integer
language plpgsql set search_path=public as $$
declare s meme_automation_settings; local_day date; done_today integer; n integer:=0;
begin
  for s in select a.* from meme_automation_settings a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
    where a.enabled and a.local_time <= (now() at time zone a.timezone)::time
    order by a.updated_at for update of a skip locked loop
    local_day:=(now() at time zone s.timezone)::date;
    select count(*) into done_today from meme_production_runs r
      where r.project_id=s.project_id and r.source='scheduled' and r.scheduler_date=local_day;
    if done_today >= s.memes_per_day then continue; end if;
    -- Từng meme một: lượt trước chưa xong thì chưa xếp lượt sau.
    if exists(select 1 from meme_production_runs r where r.project_id=s.project_id and r.source='scheduled' and r.status in ('queued','running')) then continue; end if;
    perform public.create_meme_production_run(s.project_id,s.created_by,s.workspace_version,'',s.options,
      md5(s.project_id::text||local_day::text||':meme:'||done_today::text)::uuid,'scheduled',local_day);
    update meme_automation_settings set updated_at=now() where project_id=s.project_id;
    n:=n+1;
  end loop;
  return n;
end $$;

revoke all on function public.create_meme_production_run(uuid,uuid,integer,text,jsonb,uuid,text,date),
  public.claim_meme_production_runs(integer,uuid), public.schedule_due_meme_automations() from public,anon,authenticated;
grant execute on function public.create_meme_production_run(uuid,uuid,integer,text,jsonb,uuid,text,date),
  public.claim_meme_production_runs(integer,uuid), public.schedule_due_meme_automations() to service_role;
