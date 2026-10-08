-- Caller wraps BEGIN / ROLLBACK. Lịch tự sản xuất: tối đa films_per_day lượt
-- mỗi ngày, nối tiếp nhau, lượt hỏng vẫn tính vào hạn mức ngày.
DO $$
declare p projects; scheduled integer; local_day date; runs integer; rejected boolean:=false;
begin
  select * into p from projects order by created_at limit 1;
  -- Dọn chỗ: không lượt nào đang chạy và không lịch nào khác chen vào.
  update short_film_production_runs set status='cancelled' where status in ('queued','scripting','running','paused','budget_blocked');
  update short_film_automation_settings set enabled=false;
  insert into short_film_automation_settings(project_id,workspace_version,enabled,local_time,films_per_day,max_points_per_film,max_points_per_day,created_by)
    values(p.id,p.workspace_version,true,'00:00',2,100,300,p.user_id)
    on conflict(project_id) do update set workspace_version=excluded.workspace_version,enabled=true,local_time='00:00',films_per_day=2,
      max_points_per_film=100,max_points_per_day=300,created_by=excluded.created_by,queued_plan_ids='{}',last_schedule_date=null;
  local_day:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  delete from short_film_production_runs where project_id=p.id and source='scheduled' and scheduler_date=local_day;

  scheduled:=schedule_due_film_automations();
  if scheduled<>1 then raise exception 'First film of the day was not scheduled (%)', scheduled; end if;
  -- Lượt đầu còn đang viết kịch bản: lượt thứ hai phải đợi, không chạy song song.
  scheduled:=schedule_due_film_automations();
  if scheduled<>0 then raise exception 'Second film started while the first is still active'; end if;

  -- Lượt đầu hỏng vẫn tính vào hạn mức; lượt thứ hai mới được xếp.
  update short_film_production_runs set status='failed' where project_id=p.id and source='scheduled' and scheduler_date=local_day;
  scheduled:=schedule_due_film_automations();
  if scheduled<>1 then raise exception 'Second film of the day was not scheduled'; end if;
  update short_film_production_runs set status='completed' where project_id=p.id and source='scheduled' and scheduler_date=local_day and status<>'failed';
  scheduled:=schedule_due_film_automations();
  if scheduled<>0 then raise exception 'Scheduled more than films_per_day'; end if;
  select count(*) into runs from short_film_production_runs where project_id=p.id and source='scheduled' and scheduler_date=local_day;
  if runs<>2 then raise exception 'Expected exactly two scheduled films, got %', runs; end if;

  begin
    update short_film_automation_settings set films_per_day=7 where project_id=p.id;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'films_per_day above 6 was accepted'; end if;
end $$;
