-- Railway claims only a small batch at a time. `skip locked` lets a second
-- worker recover after a crash without ever processing the same prediction in
-- parallel. The function is intentionally not granted to browser roles.
create or replace function public.claim_wavespeed_video_jobs(
  _batch_size integer default 2,
  _lease_seconds integer default 90
)
returns table (
  id uuid,
  project_id uuid,
  content_output_id uuid,
  provider_request_id text,
  requested_output jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if _batch_size < 1 or _batch_size > 8 or _lease_seconds < 30 or _lease_seconds > 600 then
    raise exception 'Invalid WaveSpeed claim parameters';
  end if;

  return query
  with candidates as (
    select gj.id
    from public.generation_jobs gj
    where gj.provider = 'wavespeed'
      and gj.status = 'running'
      and gj.provider_request_id is not null
      and (gj.lease_expires_at is null or gj.lease_expires_at <= now())
    order by gj.started_at asc nulls last, gj.created_at asc
    limit _batch_size
    for update skip locked
  )
  update public.generation_jobs gj
  set lease_expires_at = now() + make_interval(secs => _lease_seconds),
      checkpoint = coalesce(gj.checkpoint, '{}'::jsonb) || jsonb_build_object('worker_claimed_at', now())
  from candidates
  where gj.id = candidates.id
  returning gj.id, gj.project_id, gj.content_output_id, gj.provider_request_id, gj.requested_output;
end;
$$;

revoke all on function public.claim_wavespeed_video_jobs(integer, integer) from public;
