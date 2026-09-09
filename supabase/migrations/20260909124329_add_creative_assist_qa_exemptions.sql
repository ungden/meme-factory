-- Operator text canaries retain their audit rows without consuming user writing quota.
-- This classification is deliberately separate from client-editable job JSON.
create table public.creative_assist_qa_exemptions (
  assist_id uuid primary key references public.creative_assists(id) on delete cascade,
  reason text not null check (length(reason) between 8 and 500),
  marked_at timestamptz not null default now()
);
alter table public.creative_assist_qa_exemptions enable row level security;
revoke all on public.creative_assist_qa_exemptions from public, anon, authenticated;
grant all on public.creative_assist_qa_exemptions to service_role;

create function public.creative_assist_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'minuteCount', count(*) filter (where c.created_at >= now() - interval '1 minute'),
    'dayCount', count(*)
  ) into result
  from public.creative_assists c
  where c.created_by = actor and c.created_at >= now() - interval '24 hours'
    and not exists (select 1 from public.creative_assist_qa_exemptions q where q.assist_id = c.id);
  return result;
end $$;
revoke all on function public.creative_assist_usage() from public, anon;
grant execute on function public.creative_assist_usage() to authenticated;
