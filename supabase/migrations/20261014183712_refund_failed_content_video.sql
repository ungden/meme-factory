-- Video lẻ hỏng thì chưa bao giờ được hoàn điểm.
--
-- Route `content-outputs/[id]/video` trừ điểm trước khi gửi nhà cung cấp, rồi
-- worker chỉ đánh dấu job `failed` (phase `provider_failed` hoặc
-- `render_failed`). Sweeper ảnh bỏ qua nhà cung cấp `wavespeed`, nên khoản trừ
-- nằm lại mãi. Hàm này hoàn đúng khoản đã trừ (tìm theo request_id lưu trong
-- checkpoint) và ghi số đã hoàn vào `error.refunded_points` để trang video nói
-- được "Đã hoàn N điểm".
--
-- Không hoàn khi gửi nhà cung cấp bị đứt giữa chừng (`error.provider_submission`,
-- phase rỗng): nhà cung cấp có thể đã nhận việc, route cố ý để người vận hành
-- đối soát.
create or replace function public.settle_failed_content_video(_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  job public.generation_jobs;
  pay public.project_transactions;
  req uuid;
  amount integer;
  refund jsonb;
begin
  select * into job from public.generation_jobs where id = _job_id for update;
  if not found then
    return jsonb_build_object('settled', false, 'reason', 'missing');
  end if;
  if job.creation_kind <> 'content_video' or job.status <> 'failed' then
    return jsonb_build_object('settled', false, 'reason', 'not_failed_video');
  end if;
  if coalesce(job.phase, '') not in ('provider_failed', 'render_failed') then
    return jsonb_build_object('settled', false, 'reason', 'needs_review');
  end if;
  if job.error ? 'refunded_points' then
    return jsonb_build_object('settled', true, 'duplicate', true, 'points', (job.error->>'refunded_points')::integer);
  end if;

  begin
    req := (job.checkpoint->>'requestId')::uuid;
  exception when others then
    req := null;
  end;
  if req is null then
    return jsonb_build_object('settled', false, 'reason', 'no_request');
  end if;

  select * into pay
  from public.project_transactions
  where request_id = req and type = 'payment' and status = 'completed' and project_id = job.project_id
  limit 1;
  if not found then
    return jsonb_build_object('settled', false, 'reason', 'no_payment');
  end if;

  amount := abs(pay.amount);
  -- Hàm hoàn tự chặn lần thứ hai theo request_id; job và sổ điểm đổi cùng một
  -- transaction nên không có lúc đã hoàn mà job chưa ghi.
  refund := public.atomic_refund_project_points(
    job.project_id,
    job.created_by,
    amount,
    format('Hoàn %s điểm — video không làm được', amount),
    req,
    'refund',
    jsonb_build_object('reason', 'failed_content_video', 'generation_job_id', job.id, 'phase', job.phase)
  );
  update public.generation_jobs
  set error = coalesce(error, '{}'::jsonb) || jsonb_build_object('refunded_points', amount)
  where id = job.id;

  return jsonb_build_object('settled', true, 'points', amount, 'refund', refund);
end;
$$;

-- Cho sweeper: hoàn mọi video lẻ đã hỏng mà chưa hoàn, kể cả khi người dùng
-- không bao giờ mở lại trang video.
create or replace function public.settle_failed_content_videos(_limit integer default 25)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  job_id uuid;
  result jsonb;
  n integer := 0;
begin
  if _limit < 1 or _limit > 100 then raise exception 'INVALID_LIMIT'; end if;
  for job_id in
    select j.id from public.generation_jobs j
    where j.creation_kind = 'content_video'
      and j.status = 'failed'
      and j.phase in ('provider_failed', 'render_failed')
      and not (coalesce(j.error, '{}'::jsonb) ? 'refunded_points')
    order by j.completed_at nulls first
    limit _limit
    for update of j skip locked
  loop
    result := public.settle_failed_content_video(job_id);
    if (result->>'settled')::boolean and not coalesce((result->>'duplicate')::boolean, false) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.settle_failed_content_video(uuid) from public, anon, authenticated;
revoke all on function public.settle_failed_content_videos(integer) from public, anon, authenticated;
grant execute on function public.settle_failed_content_video(uuid) to service_role;
grant execute on function public.settle_failed_content_videos(integer) to service_role;
