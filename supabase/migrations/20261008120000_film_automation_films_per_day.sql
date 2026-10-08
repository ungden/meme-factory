-- Kênh phim ngắn tự sản xuất theo nhu cầu: 1–6 phim mỗi ngày thay vì cố định 1.
-- Phim sau chỉ được xếp khi kênh không còn lượt nào đang chạy (index
-- short_film_one_active_run), nên các phim trong ngày nối tiếp nhau chứ không
-- chạy song song và không tiêu vượt trần điểm mỗi ngày của lượt chạy.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_attribute att on att.attrelid=con.conrelid and att.attnum=any(con.conkey)
    where con.conrelid='public.short_film_automation_settings'::regclass
      and con.contype='c' and att.attname='films_per_day'
  loop
    execute format('alter table public.short_film_automation_settings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.short_film_automation_settings
  add constraint short_film_automation_films_per_day check (films_per_day between 1 and 6);

-- Ràng buộc cũ "một lượt lên lịch mỗi ngày" chặn phim thứ hai. Chống trùng nay
-- dựa vào khoá idempotency theo thứ tự phim trong ngày và dòng lịch bị khoá
-- (for update) trong lúc xếp.
alter table public.short_film_production_runs
  drop constraint if exists short_film_production_runs_project_id_scheduler_date_key;

create or replace function public.schedule_due_film_automations() returns integer
language plpgsql set search_path=public as $$
declare s short_film_automation_settings; local_day date; chosen uuid; chosen_version integer; rid uuid; n integer:=0; selected_model text; done_today integer;
begin
  for s in select a.* from short_film_automation_settings a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
    where a.enabled and a.local_time <= (now() at time zone a.timezone)::time
    order by a.updated_at for update of a skip locked loop
    chosen:=null; chosen_version:=null;
    local_day:=(now() at time zone s.timezone)::date;
    -- Đếm mọi lượt đã xếp trong ngày, kể cả lượt hỏng hay huỷ: một lượt hỏng
    -- không được mở thêm lượt mới vô hạn và đốt điểm.
    select count(*) into done_today from short_film_production_runs r
      where r.project_id=s.project_id and r.source='scheduled' and r.scheduler_date=local_day;
    if done_today >= s.films_per_day then continue; end if;
    if exists(select 1 from short_film_production_runs r where r.project_id=s.project_id and r.status in ('queued','scripting','running','paused','budget_blocked')) then continue; end if;
    select v.id,v.version into chosen,chosen_version from unnest(s.queued_plan_ids) with ordinality q(id,ord)
      join video_plans v on v.id=q.id and v.project_id=s.project_id and v.workspace_version=s.workspace_version
      where v.status not in ('completed','approved','cancelled') order by q.ord limit 1;
    selected_model:=coalesce(s.default_config->>'videoModel','bytedance/seedance-2.5/text-to-video');
    rid:=public.create_film_production_run_v2(s.project_id,s.created_by,s.workspace_version,chosen,chosen_version,'',s.max_points_per_film,s.max_points_per_day,
      md5(s.project_id::text||local_day::text||':'||done_today::text)::uuid,'scheduled',local_day,selected_model);
    update short_film_automation_settings set last_schedule_date=local_day,updated_at=now(),queued_plan_ids=case when chosen is null then queued_plan_ids else array_remove(queued_plan_ids,chosen) end where project_id=s.project_id;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.schedule_due_film_automations() from public,anon,authenticated;
