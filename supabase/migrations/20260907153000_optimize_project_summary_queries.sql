-- Project cards used to fetch every character, content set, and output to
-- count them in the API process. Keep the aggregation in Postgres and retain
-- the same collaborator visibility rule as the project RLS policies.
create or replace function public.get_project_card_summaries()
returns table (
  project_id uuid,
  character_count bigint,
  output_count bigint,
  draft_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as project_id,
    (select count(*) from public.characters c where c.project_id = p.id) as character_count,
    (
      select count(*)
      from public.content_outputs co
      join public.content_sets cs on cs.id = co.content_set_id
      where cs.project_id = p.id
    ) as output_count,
    (select count(*) from public.content_sets cs where cs.project_id = p.id and cs.status = 'draft') as draft_count
  from public.projects p
  where p.user_id = auth.uid()
     or exists (
       select 1
       from public.project_members pm
       where pm.project_id = p.id and pm.user_id = auth.uid()
     );
$$;

revoke all on function public.get_project_card_summaries() from public;
grant execute on function public.get_project_card_summaries() to authenticated;

-- These match the bounded, newest-first reads on the overview and media APIs.
create index if not exists idx_memes_project_created_desc
  on public.memes(project_id, created_at desc);
create index if not exists idx_content_sets_project_created_desc
  on public.content_sets(project_id, created_at desc);
