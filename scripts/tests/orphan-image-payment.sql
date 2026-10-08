-- Caller wraps BEGIN / ROLLBACK. Khoản trừ ảnh không có job sau hạn thì được
-- hoàn đúng một lần; khoản có job, khoản quá cũ và khoản phim thì không.
DO $$
declare p projects; orphan uuid:=gen_random_uuid(); with_job uuid:=gen_random_uuid(); film uuid:=gen_random_uuid(); n integer; refunds integer;
begin
  select * into p from projects order by created_at limit 1;
  insert into project_transactions(project_id,actor_user_id,amount,type,description,status,request_id,ai_action,created_at) values
    (p.id,p.user_id,6,'payment','QA orphan','completed',orphan,'meme',now()-interval '1 hour'),
    (p.id,p.user_id,6,'payment','QA with job','completed',with_job,'meme',now()-interval '1 hour'),
    (p.id,p.user_id,40,'payment','QA film','completed',film,'short_film',now()-interval '1 hour');
  insert into generation_jobs(id,project_id,creation_kind,provider,model,compiled_prompt,manifest_hash,estimated_points,created_by,status)
    values(with_job,p.id,'meme','google','m','p','h',6,p.user_id,'completed');
  n:=settle_orphan_image_payments(now()-interval '30 minutes',25);
  if n<>1 then raise exception 'Expected one orphan refund, got %', n; end if;
  select count(*) into refunds from project_transactions where request_id in (orphan,with_job,film) and type='refund';
  if refunds<>1 or not exists(select 1 from project_transactions where request_id=orphan and type='refund') then raise exception 'Wrong payments refunded'; end if;
  if settle_orphan_image_payments(now()-interval '30 minutes',25)<>0 then raise exception 'Orphan refunded twice'; end if;
  if has_function_privilege('authenticated','settle_orphan_image_payments(timestamptz,integer)','EXECUTE') then raise exception 'Client can trigger refunds'; end if;
end $$;
