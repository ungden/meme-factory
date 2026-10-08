-- Caller wraps BEGIN / ROLLBACK. Meme tự sản xuất: lượt bấm tay chống trùng,
-- lịch xếp từng meme một tới đúng hạn mức ngày, lượt hỏng ba lần thì dừng.
DO $$
declare p projects; first uuid; again uuid; scheduled integer; claimed meme_production_runs; runs integer; local_day date; rejected boolean:=false;
begin
  select * into p from projects order by created_at limit 1;
  first:=create_meme_production_run(p.id,p.user_id,p.workspace_version,'Than tiền điện','{"format":"4:5"}'::jsonb,'00000000-0000-0000-0000-0000000000aa','manual',null);
  again:=create_meme_production_run(p.id,p.user_id,p.workspace_version,'Than tiền điện','{"format":"4:5"}'::jsonb,'00000000-0000-0000-0000-0000000000aa','manual',null);
  if first<>again then raise exception 'Manual meme run is not idempotent'; end if;
  begin
    perform create_meme_production_run(p.id,p.user_id,p.workspace_version,'Ý khác','{}'::jsonb,'00000000-0000-0000-0000-0000000000aa','manual',null);
  exception when others then rejected:=position('IDEMPOTENCY_PAYLOAD_CONFLICT' in sqlerrm)>0; end;
  if not rejected then raise exception 'Reused key with another idea was accepted'; end if;

  -- Nhận lượt: có lease và tăng số lần thử; lượt đang giữ lease không bị nhận lần nữa.
  -- Nhận đúng lượt được chỉ định, không lấy lượt của kênh khác.
  if exists(select 1 from claim_meme_production_runs(1, gen_random_uuid())) then raise exception 'Claimed a run that was not asked for'; end if;
  select * into claimed from claim_meme_production_runs(1, first);
  if claimed.id<>first or claimed.status<>'running' or claimed.attempts<>1 then raise exception 'Claim did not lease the queued run'; end if;
  if exists(select 1 from claim_meme_production_runs(1) c where c.id=first) then raise exception 'Leased run was claimed twice'; end if;
  -- Ba lần hỏng mà lease đã hết thì dừng hẳn.
  update meme_production_runs set attempts=3,lease_expires_at=now()-interval '1 minute' where id=first;
  perform claim_meme_production_runs(1);
  if (select status from meme_production_runs where id=first)<>'failed' then raise exception 'Run retried past three attempts'; end if;

  -- Lịch: hai meme mỗi ngày, từng cái một.
  update meme_automation_settings set enabled=false;
  insert into meme_automation_settings(project_id,workspace_version,enabled,local_time,memes_per_day,created_by)
    values(p.id,p.workspace_version,true,'00:00',2,p.user_id)
    on conflict(project_id) do update set enabled=true,local_time='00:00',memes_per_day=2,workspace_version=excluded.workspace_version;
  local_day:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
  scheduled:=schedule_due_meme_automations();
  if scheduled<>1 then raise exception 'First scheduled meme missing'; end if;
  if schedule_due_meme_automations()<>0 then raise exception 'Second meme queued before the first finished'; end if;
  update meme_production_runs set status='completed' where project_id=p.id and source='scheduled' and scheduler_date=local_day;
  if schedule_due_meme_automations()<>1 then raise exception 'Second scheduled meme missing'; end if;
  update meme_production_runs set status='completed' where project_id=p.id and source='scheduled' and scheduler_date=local_day;
  if schedule_due_meme_automations()<>0 then raise exception 'Scheduled beyond memes_per_day'; end if;
  select count(*) into runs from meme_production_runs where project_id=p.id and source='scheduled' and scheduler_date=local_day;
  if runs<>2 then raise exception 'Expected two scheduled memes, got %', runs; end if;

  if has_function_privilege('authenticated','claim_meme_production_runs(integer,uuid)','EXECUTE')
    or has_table_privilege('authenticated','meme_production_runs','INSERT')
    then raise exception 'Client can drive meme production directly'; end if;
end $$;
