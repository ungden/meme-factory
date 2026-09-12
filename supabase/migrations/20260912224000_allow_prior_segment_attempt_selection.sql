-- A person may deliberately restore a completed attempt from an older prompt
-- revision. The selected task id is frozen in the edit manifest, so provenance
-- stays explicit even while the editable text remains on its newest revision.
create or replace function public.select_film_segment_source(
  p_project uuid,
  p_actor uuid,
  p_workspace integer,
  p_segment uuid,
  p_expected_revision integer,
  p_task uuid,
  p_in numeric,
  p_out numeric
) returns public.short_film_segments
language plpgsql set search_path=public as $$
declare s public.short_film_segments; t public.short_film_tasks;
begin
  perform public.film_assert_access(p_project,p_actor,p_workspace);
  select * into s from public.short_film_segments where id=p_segment for update;
  if not found or s.project_id<>p_project or s.workspace_version<>p_workspace
     or s.active_revision<>p_expected_revision then raise exception 'SEGMENT_VERSION_CONFLICT'; end if;
  select * into t from public.short_film_tasks where id=p_task and project_id=p_project
    and workspace_version=p_workspace and status='completed'
    and kind in ('video','dub','lip_sync') for update;
  if not found or not (t.scene_id=s.scene_id or t.segment_id=s.id)
    then raise exception 'SEGMENT_SOURCE_INVALID'; end if;
  if p_in<0 or p_out<=p_in or p_out>coalesce((t.result->>'duration')::numeric,0)+0.05
    then raise exception 'SEGMENT_RANGE_INVALID'; end if;
  update public.short_film_segments set selected_task_id=t.id,
    selected_in_seconds=p_in,selected_out_seconds=p_out,
    selected_by=p_actor,selected_at=now(),updated_at=now()
   where id=s.id returning * into s;
  insert into public.short_film_reviews(task_id,reviewer_id)
    values(t.id,p_actor) on conflict do nothing;
  update public.short_film_tasks set approved_by=p_actor,approved_at=coalesce(approved_at,now())
    where id=t.id;
  return s;
end $$;

revoke all on function public.select_film_segment_source(uuid,uuid,integer,uuid,integer,uuid,numeric,numeric)
  from public,anon,authenticated;
grant execute on function public.select_film_segment_source(uuid,uuid,integer,uuid,integer,uuid,numeric,numeric)
  to service_role;
