create table public.short_film_script_reviews (
 plan_id uuid not null references public.video_plans(id) on delete cascade,
 version integer not null,
 project_id uuid not null references public.projects(id) on delete cascade,
 workspace_version integer not null,
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 snapshot jsonb not null,
 primary key(plan_id,version)
);
alter table public.short_film_script_reviews enable row level security;
revoke all on public.short_film_script_reviews from anon,authenticated;
grant select on public.short_film_script_reviews to authenticated;
grant all on public.short_film_script_reviews to service_role;
create policy "Members read script reviews" on public.short_film_script_reviews for select to authenticated using (
 exists(select 1 from projects p where p.id=project_id and p.workspace_version=short_film_script_reviews.workspace_version and
 (p.user_id=auth.uid() or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=auth.uid())))
);
create function public.review_film_script(p_project uuid,p_actor uuid,p_workspace integer,p_plan uuid,p_expected integer)
returns void language plpgsql set search_path=public as $$
declare v video_plans; scenes jsonb;
begin
 perform film_assert_access(p_project,p_actor,p_workspace);
 select * into v from video_plans where id=p_plan and project_id=p_project and workspace_version=p_workspace for update;
 if not found or v.version<>p_expected then raise exception 'VERSION_CONFLICT'; end if;
 select jsonb_agg(to_jsonb(s) order by scene_index) into scenes from video_plan_scenes s where video_plan_id=p_plan and deleted_at is null;
 if scenes is null then raise exception 'EMPTY_SCRIPT'; end if;
 insert into short_film_script_reviews(plan_id,version,project_id,workspace_version,reviewed_by,snapshot)
 values(p_plan,v.version,p_project,p_workspace,p_actor,jsonb_build_object('plan',to_jsonb(v),'scenes',scenes)) on conflict do nothing;
end $$;
revoke all on function public.review_film_script(uuid,uuid,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.review_film_script(uuid,uuid,integer,uuid,integer) to service_role;
