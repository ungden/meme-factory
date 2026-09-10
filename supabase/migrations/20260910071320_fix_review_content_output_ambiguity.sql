create or replace function public.review_content_output(
  p_output uuid,
  p_actor uuid,
  p_status text,
  p_note text default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
set search_path=public
as $$
declare
  o public.content_outputs;
  v_project_id uuid;
  workspace integer;
  affected_runs integer:=0;
begin
  if p_status not in ('approved','rejected') then raise exception 'INVALID_REVIEW_STATUS'; end if;
  select * into o from public.content_outputs where id=p_output for update;
  if not found then raise exception 'OUTPUT_NOT_FOUND'; end if;
  select cs.project_id into v_project_id from public.content_sets cs where cs.id=o.content_set_id;
  select p.workspace_version into workspace from public.projects p where p.id=v_project_id;
  perform public.film_assert_access(v_project_id,p_actor,workspace);
  if o.status not in ('completed','approved','rejected') then raise exception 'OUTPUT_NOT_COMPLETE'; end if;
  if p_expected_version is not null and o.review_version<>p_expected_version then raise exception 'REVIEW_VERSION_CONFLICT'; end if;

  insert into public.content_output_reviews(content_output_id,status,reviewer_id,note,version)
  values(o.id,p_status,p_actor,nullif(left(coalesce(p_note,''),2000),''),o.review_version)
  on conflict(content_output_id,version,reviewer_id) do update set status=excluded.status,note=excluded.note,created_at=now();
  update public.content_outputs set status=p_status,
    approved_at=case when p_status='approved' then now() else null end,
    approved_by=case when p_status='approved' then p_actor else null end where id=o.id;
  update public.video_plans set status=case when p_status='approved' then 'approved' else 'completed' end,updated_at=now()
    where latest_content_output_id=o.id;
  if p_status='approved' then
    update public.short_film_production_runs r set
      status='completed',phase='ready_review',error=null,completed_at=now(),lease_owner=null,lease_expires_at=null,
      snapshot=r.snapshot||jsonb_build_object('outputId',o.id,'humanReview',jsonb_build_object(
        'status','approved','version',o.review_version,'reviewerId',p_actor,'reviewedAt',now())),updated_at=now()
    where r.project_id=v_project_id and r.status in ('needs_review','completed')
      and exists(select 1 from public.video_plans v where v.id=r.plan_id and v.latest_content_output_id=o.id);
    get diagnostics affected_runs=row_count;
  end if;
  return jsonb_build_object('id',o.id,'status',p_status,'reviewVersion',o.review_version,'productionRunsClosed',affected_runs);
end $$;

revoke all on function public.review_content_output(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.review_content_output(uuid,uuid,text,text,integer) to service_role;
