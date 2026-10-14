-- Caller wraps BEGIN / ROLLBACK. Video lẻ hỏng ở nhà cung cấp được hoàn đúng
-- khoản đã trừ, đúng một lần; gửi bị đứt giữa chừng và video xong thì không.
DO $$
declare
  p projects;
  failed_job uuid := gen_random_uuid();
  submit_job uuid := gen_random_uuid();
  done_job uuid := gen_random_uuid();
  failed_req uuid := gen_random_uuid();
  submit_req uuid := gen_random_uuid();
  done_req uuid := gen_random_uuid();
  before_points integer;
  after_points integer;
  result jsonb;
  refunds integer;
begin
  select * into p from projects order by created_at limit 1;
  insert into project_wallets(project_id, points) values (p.id, 0) on conflict (project_id) do nothing;
  select points into before_points from project_wallets where project_id = p.id;

  insert into project_transactions(project_id, actor_user_id, amount, type, description, status, request_id, ai_action) values
    (p.id, p.user_id, 120, 'payment', 'QA video hỏng', 'completed', failed_req, 'video'),
    (p.id, p.user_id, 120, 'payment', 'QA video gửi đứt', 'completed', submit_req, 'video'),
    (p.id, p.user_id, 120, 'payment', 'QA video xong', 'completed', done_req, 'video');
  insert into generation_jobs(id, project_id, creation_kind, provider, model, compiled_prompt, manifest_hash, estimated_points, created_by, status, phase, error, checkpoint) values
    (failed_job, p.id, 'content_video', 'wavespeed', 'm', 'p', 'h1', 999, p.user_id, 'failed', 'provider_failed', '{"provider":"failed"}', jsonb_build_object('requestId', failed_req)),
    (submit_job, p.id, 'content_video', 'wavespeed', 'm', 'p', 'h2', 120, p.user_id, 'failed', null, '{"provider_submission":"reset"}', jsonb_build_object('requestId', submit_req)),
    (done_job, p.id, 'content_video', 'wavespeed', 'm', 'p', 'h3', 120, p.user_id, 'completed', 'stored', null, jsonb_build_object('requestId', done_req));

  result := settle_failed_content_video(failed_job);
  if not (result->>'settled')::boolean or (result->>'points')::integer <> 120 then
    raise exception 'Expected 120 refunded from the payment, got %', result;
  end if;
  if (select (error->>'refunded_points')::integer from generation_jobs where id = failed_job) <> 120 then
    raise exception 'Job does not record the refund';
  end if;
  if (settle_failed_content_video(submit_job)->>'settled')::boolean then raise exception 'Interrupted submission refunded'; end if;
  if (settle_failed_content_video(done_job)->>'settled')::boolean then raise exception 'Completed video refunded'; end if;

  -- Gọi lại, và sweeper chạy sau, không cộng thêm.
  result := settle_failed_content_video(failed_job);
  if not coalesce((result->>'duplicate')::boolean, false) then raise exception 'Second call not marked duplicate: %', result; end if;
  perform settle_failed_content_videos(100);

  select count(*) into refunds from project_transactions where request_id in (failed_req, submit_req, done_req) and type = 'refund';
  if refunds <> 1 then raise exception 'Expected exactly one refund, got %', refunds; end if;
  select points into after_points from project_wallets where project_id = p.id;
  if after_points - before_points <> 120 then raise exception 'Wallet moved by %, expected 120', after_points - before_points; end if;

  if has_function_privilege('authenticated', 'settle_failed_content_video(uuid)', 'EXECUTE') then raise exception 'Client can trigger refunds'; end if;
  if has_function_privilege('authenticated', 'settle_failed_content_videos(integer)', 'EXECUTE') then raise exception 'Client can trigger refunds'; end if;
end $$;
