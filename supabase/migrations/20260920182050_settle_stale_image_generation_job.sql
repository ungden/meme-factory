-- Settle exactly one abandoned non-film image job under a row lock. The old
-- sweeper read output, refunded, then updated the job in three separate calls;
-- a retry could race that gap and short-film image/TTS jobs also matched it.
create or replace function public.settle_stale_image_generation_job(
  _job_id uuid,
  _stale_before timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  job public.generation_jobs;
  refund jsonb;
begin
  select * into job
  from public.generation_jobs
  where id = _job_id
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'missing');
  end if;
  if job.status not in ('queued', 'running') or job.created_at >= _stale_before then
    return jsonb_build_object('settled', false, 'reason', 'not_stale');
  end if;
  if job.lease_expires_at is not null and job.lease_expires_at > now() then
    return jsonb_build_object('settled', false, 'reason', 'leased');
  end if;
  -- Film tasks own their lease/checkpoint and settlement.  Do not infer their
  -- state from generation_outputs, because a film may be between provider and
  -- storage while still legitimately running.
  if job.workflow_version = 'short-film-v2'
     or job.video_plan_id is not null
     or exists (select 1 from public.short_film_tasks t where t.generation_job_id = job.id) then
    return jsonb_build_object('settled', false, 'reason', 'film_task');
  end if;
  if exists (select 1 from public.generation_outputs o where o.generation_job_id = job.id) then
    return jsonb_build_object('settled', false, 'reason', 'has_output');
  end if;

  -- Both the ledger refund and failed status commit or roll back together.
  refund := public.atomic_refund_project_points(
    job.project_id,
    job.created_by,
    job.estimated_points,
    format('Hoàn %s điểm — lượt tạo ảnh không hoàn tất', job.estimated_points),
    job.id,
    'refund',
    jsonb_build_object(
      'reason', 'sweeper_stale_image_job',
      'creation_kind', job.creation_kind,
      'workflow_version', job.workflow_version
    )
  );
  update public.generation_jobs
  set status = 'failed',
      error = jsonb_build_object(
        'code', 'ABANDONED',
        'message', 'Lượt tạo không hoàn tất trước thời hạn đối soát.'
      ),
      completed_at = now()
  where id = job.id;

  return jsonb_build_object('settled', true, 'refund', refund);
end;
$$;

revoke all on function public.settle_stale_image_generation_job(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_stale_image_generation_job(uuid, timestamptz)
  to service_role;
