-- All write RPCs are SECURITY INVOKER and executable only by the server role.
-- User/project/workspace checks are repeated inside the transaction.
alter table public.video_plans add column workspace_version integer not null default 1,
  add column audio_mode text not null default 'native' check (audio_mode in ('native','fixed')),
  add column caption text not null default '', add column subtitles boolean not null default true;
update public.video_plans v set workspace_version=p.workspace_version from public.projects p where p.id=v.project_id;
alter table public.video_plan_scenes add column camera text not null default '',
  add column media_links jsonb not null default '{}', add column input_hash text,
  add column deleted_at timestamptz;
alter table public.video_plan_scenes drop constraint video_plan_scenes_video_plan_id_scene_index_key;
create unique index video_scenes_live_order on public.video_plan_scenes(video_plan_id,scene_index) where deleted_at is null;
alter table public.video_plan_scenes drop constraint video_plan_scenes_duration_seconds_check;
alter table public.video_plan_scenes add check(duration_seconds between 4 and 30);

create table public.character_voice_versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade, version integer not null,
 workspace_version integer not null, model text not null default 'minimax/speech-2.6-hd', voice_id text not null,
 settings jsonb not null default '{}', sample_task_id uuid, approved_by uuid references auth.users(id), approved_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(character_id,version)
);
create table public.short_film_quotes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 plan_id uuid references public.video_plans(id) on delete cascade, plan_version integer, workspace_version integer not null,
 created_by uuid not null references auth.users(id), tasks jsonb not null, points integer not null check(points>=0),
 expires_at timestamptz not null default now()+interval '5 minutes', accepted_key uuid, created_at timestamptz not null default now()
);
create table public.short_film_tasks (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 plan_id uuid references public.video_plans(id) on delete set null, plan_version integer, scene_id uuid references public.video_plan_scenes(id) on delete set null,
 scene_version integer, workspace_version integer not null, run_id uuid not null, generation_job_id uuid not null references public.generation_jobs(id),
 kind text not null check(kind in ('image','tts','video','lip_sync','transcribe','render','frame')),
 input jsonb not null, dependencies uuid[] not null default '{}', status text not null default 'queued'
 check(status in ('queued','running','reconciling','completed','failed','cancelled')),
 checkpoint jsonb not null default '{}', result jsonb, error text, provider_id text,
 lease_owner uuid, lease_expires_at timestamptz, next_poll_at timestamptz not null default now(),
 points integer not null default 0 check(points>=0), approved_by uuid references auth.users(id), approved_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index short_film_provider_id on public.short_film_tasks(provider_id) where provider_id is not null;
create index short_film_claim on public.short_film_tasks(status,next_poll_at,lease_expires_at,created_at);
create index short_film_project_tasks on public.short_film_tasks(project_id,created_at desc);
create index short_film_plan_tasks on public.short_film_tasks(plan_id,scene_id,created_at desc);
create table public.short_film_webhook_events(id text primary key, provider_id text not null, payload jsonb not null, created_at timestamptz not null default now());
alter table public.character_voice_versions enable row level security;
alter table public.short_film_quotes enable row level security;
alter table public.short_film_tasks enable row level security;
alter table public.short_film_webhook_events enable row level security;
create policy film_tasks_read on public.short_film_tasks for select to authenticated using(project_id in (select id from public.projects));
create policy film_voices_read on public.character_voice_versions for select to authenticated using(project_id in (select id from public.projects));
revoke all on public.video_plans,public.video_plan_scenes,public.video_batches,public.video_batch_items,
 public.character_voice_versions,public.short_film_tasks,public.short_film_quotes,public.short_film_webhook_events from anon,authenticated;
grant select on public.video_plans,public.video_plan_scenes,public.video_batches,public.video_batch_items,public.character_voice_versions,public.short_film_tasks to authenticated;
grant all on public.character_voice_versions,public.short_film_tasks,public.short_film_quotes,public.short_film_webhook_events to service_role;
update storage.buckets set allowed_mime_types=array['video/mp4','image/jpeg','image/png','image/webp','audio/wav','audio/mpeg','text/plain','application/x-subrip','text/vtt'] where id='content-media';

create function public.film_assert_access(p_project uuid,p_actor uuid,p_workspace integer) returns void language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from projects p where p.id=p_project and p.workspace_version=p_workspace and
 (p.user_id=p_actor or exists(select 1 from project_members m where m.project_id=p.id and m.user_id=p_actor))) then raise exception 'WORKSPACE_OR_ACCESS_CHANGED'; end if;
end $$;

create function public.save_film_plan(p_project uuid,p_actor uuid,p_workspace integer,p_id uuid,p_expected integer,p_plan jsonb,p_scenes jsonb)
returns uuid language plpgsql set search_path=public as $$
declare v video_plans; s jsonb; sid uuid; seen uuid[]:='{}'; prior video_plan_scenes; ver integer;
begin
 perform film_assert_access(p_project,p_actor,p_workspace);
 if jsonb_array_length(p_scenes) not between 1 and 12 then raise exception 'INVALID_SCENES'; end if;
 if p_expected is null then
  insert into video_plans(id,project_id,created_by,workspace_version) values(p_id,p_project,p_actor,p_workspace) returning * into v;
 else
  select * into v from video_plans where id=p_id and project_id=p_project and workspace_version=p_workspace for update;
  if not found or v.version<>p_expected then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 ver:=case when p_expected is null then 1 else v.version+1 end;
 update video_plans set title=p_plan->>'title',brief=p_plan->>'brief',format=p_plan->>'format',resolution=p_plan->>'resolution',
 audio_mode=p_plan->>'audio_mode',generate_audio=(p_plan->>'audio_mode')='native',caption=coalesce(p_plan->>'caption',''),
 subtitles=coalesce((p_plan->>'subtitles')::boolean,true),target_duration_seconds=(p_plan->>'target_duration_seconds')::integer,
 cast_snapshot=p_plan->'cast_snapshot',version=ver,status='draft',quote_snapshot=null,quote_expires_at=null where id=p_id;
 -- Vacate only ordering slots; do not delete historical scene/media rows.
 update video_plan_scenes set deleted_at=now() where video_plan_id=p_id and deleted_at is null;
 for s in select value from jsonb_array_elements(p_scenes) loop
  sid:=(s->>'id')::uuid;
  select * into prior from video_plan_scenes where id=sid;
  if found and prior.video_plan_id<>p_id then raise exception 'SCENE_PROJECT_MISMATCH'; end if;
  if sid=any(seen) then raise exception 'DUPLICATE_SCENE'; end if; seen:=array_append(seen,sid);
  insert into video_plan_scenes(id,video_plan_id,scene_index,version,cast_snapshot,speaker_character_id,dialogue,action,setting,camera,
   duration_seconds,start_image_url,end_image_url,follows_previous,image_prompt,motion_prompt,source_mode,input_hash)
  values(sid,p_id,(s->>'scene_index')::integer,1,s->'cast_snapshot',(s->>'speaker_character_id')::uuid,s->>'dialogue',s->>'action',s->>'setting',s->>'camera',
   (s->>'duration_seconds')::integer,s->>'start_image_url',s->>'end_image_url',(s->>'follows_previous')::boolean,s->>'image_prompt',s->>'motion_prompt',s->>'source_mode',s->>'input_hash')
  on conflict(id) do update set scene_index=excluded.scene_index,deleted_at=null,
   version=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.version else video_plan_scenes.version+1 end,
   cast_snapshot=excluded.cast_snapshot,speaker_character_id=excluded.speaker_character_id,dialogue=excluded.dialogue,action=excluded.action,setting=excluded.setting,camera=excluded.camera,
   duration_seconds=excluded.duration_seconds,start_image_url=excluded.start_image_url,end_image_url=excluded.end_image_url,follows_previous=excluded.follows_previous,
   image_prompt=excluded.image_prompt,motion_prompt=excluded.motion_prompt,source_mode=excluded.source_mode,input_hash=excluded.input_hash,
   media_links=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.media_links else '{}'::jsonb end,
   status=case when video_plan_scenes.input_hash=excluded.input_hash then video_plan_scenes.status else 'draft' end;
 end loop;
 return p_id;
end $$;

create function public.accept_film_quote(p_quote uuid,p_actor uuid,p_key uuid) returns jsonb language plpgsql set search_path=public as $$
declare q short_film_quotes; t jsonb; j uuid; tid uuid; charge jsonb; v video_plans; existing uuid;
begin
 select * into q from short_film_quotes where id=p_quote and created_by=p_actor for update;
 if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
 perform film_assert_access(q.project_id,p_actor,q.workspace_version);
 if q.accepted_key is not null then return jsonb_build_object('jobId',q.accepted_key,'duplicate',true); end if;
 if q.expires_at<=now() then raise exception 'QUOTE_EXPIRED'; end if;
 if q.plan_id is not null then
  select * into v from video_plans where id=q.plan_id for update;
  if v.version<>q.plan_version then raise exception 'VERSION_CONFLICT'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtext(p_key::text));
 if exists(select 1 from short_film_tasks where run_id=p_key) then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
 -- A different quote may not start another copy while this stage is active.
 for t in select value from jsonb_array_elements(q.tasks) loop
  if exists(select 1 from short_film_tasks a where a.project_id=q.project_id and a.kind=t->>'kind'
   and a.scene_id is not distinct from (t->>'sceneId')::uuid and a.scene_version is not distinct from (t->>'sceneVersion')::integer
   and a.input->>'subjectKey'=t->'input'->>'subjectKey' and a.status in ('queued','running','reconciling')) then raise exception 'STAGE_ALREADY_RUNNING'; end if;
 end loop;
 if q.points>0 then
  charge:=atomic_deduct_project_points(q.project_id,p_actor,q.points,'Giữ điểm sản xuất phim',p_key,'short_film',jsonb_build_object('quote_id',q.id,'reservation',true));
  if not coalesce((charge->>'success')::boolean,false) then raise exception 'INSUFFICIENT_POINTS'; end if;
 end if;
 for t in select value from jsonb_array_elements(q.tasks) loop
  tid:=(t->>'id')::uuid; j:=gen_random_uuid();
  insert into generation_jobs(id,project_id,creation_kind,workflow_version,provider,model,status,compiled_prompt,manifest_hash,requested_output,estimated_points,actual_points,created_by,video_plan_id,video_plan_scene_id)
   values(j,q.project_id,case when t->>'kind'='image' then 'content_image' else 'content_video' end,'short-film-v2',
   case when t->>'kind'='image' then 'google' else 'wavespeed' end,coalesce(t->'input'->>'model','ffmpeg'), 'queued',coalesce(t->'input'->>'prompt',''),t->>'hash',t->'input',(t->>'points')::integer,0,p_actor,q.plan_id,(t->>'sceneId')::uuid);
  insert into short_film_tasks(id,project_id,plan_id,plan_version,scene_id,scene_version,workspace_version,run_id,generation_job_id,kind,input,dependencies,points,created_by)
   values(tid,q.project_id,q.plan_id,q.plan_version,(t->>'sceneId')::uuid,(t->>'sceneVersion')::integer,q.workspace_version,p_key,j,t->>'kind',t->'input',
    array(select jsonb_array_elements_text(coalesce(t->'dependencies','[]'))::uuid),(t->>'points')::integer,p_actor);
 end loop;
 update short_film_quotes set accepted_key=p_key where id=q.id;
 return jsonb_build_object('jobId',p_key,'duplicate',false);
end $$;

create function public.claim_film_tasks(p_render boolean,p_limit integer default 2) returns setof short_film_tasks language plpgsql set search_path=public as $$
declare t short_film_tasks; slots integer; taken integer:=0;
begin
 if p_limit<1 or p_limit>2 then raise exception 'INVALID_BATCH'; end if;
 perform pg_advisory_xact_lock(case when p_render then 8172601 else 8172602 end);
 select greatest(0,(case when p_render then 1 else 2 end)-count(*))::integer into slots from short_film_tasks
  where status in ('running','reconciling') and ((kind in ('render','frame'))=p_render);
 for t in select a.* from short_film_tasks a join projects p on p.id=a.project_id and p.workspace_version=a.workspace_version
  where a.status in ('queued','running') and a.next_poll_at<=now() and (a.lease_expires_at is null or a.lease_expires_at<=now())
   and ((a.kind in ('render','frame'))=p_render)
   and not exists(select 1 from unnest(a.dependencies) dep left join short_film_tasks d on d.id=dep where d.id is null or d.status<>'completed')
  order by (a.status='running') desc,a.next_poll_at,a.created_at for update of a skip locked
 loop
  if taken>=p_limit then exit; end if;
  if t.status='queued' and slots<=0 then continue; end if;
  if t.status='queued' then slots:=slots-1; end if;
  update short_film_tasks set status='running',lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',updated_at=now() where id=t.id returning * into t;
  update generation_jobs set status='running',started_at=coalesce(started_at,now()),phase=t.kind where id=t.generation_job_id;
  taken:=taken+1;return next t;
 end loop;
end $$;

create function public.checkpoint_film_task(p_id uuid,p_owner uuid,p_patch jsonb) returns boolean language plpgsql set search_path=public as $$
begin
 update short_film_tasks t set checkpoint=t.checkpoint||coalesce(p_patch->'checkpoint','{}'),
 provider_id=coalesce(p_patch->>'provider_id',t.provider_id),result=coalesce(p_patch->'result',t.result),
 status=coalesce(p_patch->>'status',t.status),error=p_patch->>'error',updated_at=now(),
 lease_expires_at=case when coalesce((p_patch->>'release')::boolean,false) then null else now()+interval '90 seconds' end,
 next_poll_at=case when coalesce((p_patch->>'release')::boolean,false) then now()+interval '3 seconds' else t.next_poll_at end
 where t.id=p_id and t.lease_owner=p_owner and t.lease_expires_at>now() and t.status='running'
 and exists(select 1 from projects p where p.id=t.project_id and p.workspace_version=t.workspace_version);
 return found;
end $$;

create function public.complete_film_task(p_id uuid,p_owner uuid,p_result jsonb) returns boolean language plpgsql set search_path=public as $$
declare t short_film_tasks; cs uuid; outid uuid;
begin
 select * into t from short_film_tasks where id=p_id for update;
 if not found or t.status<>'running' or t.lease_owner<>p_owner or t.lease_expires_at<=now() then return false; end if;
 perform film_assert_access(t.project_id,t.created_by,t.workspace_version);
 update short_film_tasks set status='completed',result=p_result,error=null,lease_expires_at=null,updated_at=now() where id=t.id;
 update generation_jobs set status='completed',actual_points=t.points,phase='stored',completed_at=now(),provider_request_id=t.provider_id where id=t.generation_job_id;
 if t.scene_id is not null then
  update video_plan_scenes set media_links=media_links||jsonb_build_object(t.kind,t.id),status=case when t.kind='transcribe' then 'needs_review' else status end
   where id=t.scene_id and version=t.scene_version and deleted_at is null;
 end if;
 if t.kind='render' then
  insert into content_sets(project_id,brief,created_by) values(t.project_id,coalesce(t.input->>'brief',''),t.created_by) returning id into cs;
  insert into content_outputs(content_set_id,generation_job_id,kind,format,caption,media_url,poster_url,duration_seconds,status,source_snapshot)
   values(cs,t.generation_job_id,'video',t.input->>'format',coalesce(t.input->>'caption',''),p_result->>'path',p_result->>'poster',ceil((p_result->>'duration')::numeric),'completed',jsonb_build_object('taskId',t.id,'manifest',t.input,'srt',p_result->>'srt')) returning id into outid;
  update short_film_tasks set result=result||jsonb_build_object('outputId',outid) where id=t.id;
  update generation_jobs set content_set_id=cs,content_output_id=outid where id=t.generation_job_id;
  update video_plans set latest_content_output_id=outid,status='completed' where id=t.plan_id and version=t.plan_version;
 end if;
 return true;
end $$;

-- Read receipt + worker event, never release another worker's lease.
create function public.record_film_event(p_id text,p_prediction text,p_payload jsonb) returns void language plpgsql set search_path=public as $$
begin
 insert into short_film_webhook_events(id,provider_id,payload) values(p_id,p_prediction,p_payload) on conflict(id) do nothing;
 update short_film_tasks set checkpoint=checkpoint||jsonb_build_object('providerEvent',p_payload) where provider_id=p_prediction and status in ('queued','running','reconciling');
end $$;

-- A render killed after claim is recoverable. Do not let the legacy poller
-- compete for jobs owned by the new task engine.
create or replace function public.claim_wavespeed_video_jobs(
  _batch_size integer default 2,
  _lease_seconds integer default 90
)
returns table (
  id uuid, project_id uuid, content_output_id uuid, video_plan_id uuid,
  video_plan_scene_id uuid, provider_request_id text, requested_output jsonb,
  lease_owner uuid
)
language plpgsql security definer set search_path = public as $$
begin
  if _batch_size < 1 or _batch_size > 8 or _lease_seconds < 30 or _lease_seconds > 600 then
    raise exception 'Invalid WaveSpeed claim parameters';
  end if;
  return query
  with candidates as (
    select gj.id from public.generation_jobs gj
    where gj.workflow_version <> 'short-film-v2' and gj.provider = 'wavespeed' and gj.status = 'running' and gj.provider_request_id is not null
      and (gj.lease_expires_at is null or gj.lease_expires_at <= now())
    order by gj.started_at asc nulls last, gj.created_at asc
    limit _batch_size for update skip locked
  )
  update public.generation_jobs gj
    set lease_expires_at = now() + make_interval(secs => _lease_seconds),
        lease_owner = gen_random_uuid(),
        checkpoint = coalesce(gj.checkpoint, '{}'::jsonb) || jsonb_build_object('worker_claimed_at', now())
  from candidates where gj.id = candidates.id
  returning gj.id, gj.project_id, gj.content_output_id, gj.video_plan_id, gj.video_plan_scene_id,
    gj.provider_request_id, gj.requested_output, gj.lease_owner;
end;
$$;

create or replace function public.claim_video_plan_render_jobs(
  _batch_size integer default 1,
  _lease_seconds integer default 90
)
returns table (id uuid, project_id uuid, content_output_id uuid, video_plan_id uuid, requested_output jsonb, lease_owner uuid)
language plpgsql security definer set search_path = public as $$
begin
  if _batch_size < 1 or _batch_size > 2 or _lease_seconds < 30 or _lease_seconds > 600 then
    raise exception 'Invalid render claim parameters';
  end if;
  return query
  with candidates as (
    select gj.id from public.generation_jobs gj
    where gj.creation_kind = 'video_plan_render' and gj.status in ('queued','running')
      and (gj.lease_expires_at is null or gj.lease_expires_at <= now())
      and not exists (
        select 1 from public.video_plan_scenes vps
        where vps.video_plan_id = gj.video_plan_id
          and vps.id = any(array(select jsonb_array_elements_text(coalesce(gj.requested_output->'sceneIds', '[]'::jsonb))::uuid))
          and vps.status <> 'completed'
      )
    order by gj.created_at limit _batch_size for update skip locked
  )
  update public.generation_jobs gj
    set status = 'running', started_at = coalesce(gj.started_at, now()),
        lease_expires_at = now() + make_interval(secs => _lease_seconds), lease_owner = gen_random_uuid(),
        checkpoint = coalesce(gj.checkpoint, '{}'::jsonb) || jsonb_build_object('render_claimed_at', now())
  from candidates where gj.id = candidates.id
  returning gj.id, gj.project_id, gj.content_output_id, gj.video_plan_id, gj.requested_output, gj.lease_owner;
end;
$$;


DO $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('film_assert_access','save_film_plan','accept_film_quote','claim_film_tasks','checkpoint_film_task','complete_film_task','record_film_event') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
create table public.short_film_reviews (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.short_film_tasks(id),
 reviewer_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(task_id,reviewer_id)
);
alter table public.short_film_reviews enable row level security;
revoke all on public.short_film_reviews from public,anon,authenticated;
grant all on public.short_film_reviews to service_role;
create function public.approve_film_task(p_task uuid,p_project uuid,p_actor uuid,p_workspace integer) returns void language plpgsql set search_path=public as $$
declare t short_film_tasks;
begin
 perform film_assert_access(p_project,p_actor,p_workspace);
 select * into t from short_film_tasks where id=p_task and project_id=p_project and workspace_version=p_workspace for update;
 if not found or t.status<>'completed' then raise exception 'RESULT_NOT_READY'; end if;
 insert into short_film_reviews(task_id,reviewer_id) values(t.id,p_actor) on conflict do nothing;
 update short_film_tasks set approved_by=p_actor,approved_at=now() where id=t.id;
 if t.input->>'voiceVersionId' is not null then update character_voice_versions set approved_by=p_actor,approved_at=now(),sample_task_id=t.id where id=(t.input->>'voiceVersionId')::uuid and project_id=p_project and workspace_version=p_workspace; end if;
 if t.kind='render' then
  update content_outputs set status='approved',approved_by=p_actor,approved_at=now() where id=(t.result->>'outputId')::uuid;
  insert into content_output_reviews(content_output_id,status,reviewer_id,version) select id,'approved',p_actor,review_version from content_outputs where id=(t.result->>'outputId')::uuid;
 end if;
end $$;
revoke all on function public.approve_film_task(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.approve_film_task(uuid,uuid,uuid,integer) to service_role;

-- Return held points only after a definitive failure or a never-submitted dependency cancellation.
create function public.settle_film_failures() returns integer language plpgsql set search_path=public as $$
declare t short_film_tasks; n integer:=0;
begin
 update short_film_tasks t set status='cancelled',error='Bước nguồn không hoàn tất; chưa gửi provider.' where status='queued' and
 (not exists(select 1 from projects p where p.id=t.project_id and p.workspace_version=t.workspace_version) or
 exists(select 1 from short_film_tasks d where d.id=any(t.dependencies) and d.status in ('failed','cancelled')));
 for t in select * from short_film_tasks where status in ('failed','cancelled') and not(checkpoint ? 'settled') for update skip locked loop
  if t.points>0 and (not coalesce((t.checkpoint->>'submitting')::boolean,false) or coalesce((t.checkpoint->>'definitiveFailure')::boolean,false)) then
   update project_wallets set points=points+t.points,updated_at=now() where project_id=t.project_id;
   insert into project_transactions(project_id,actor_user_id,amount,type,description,status,request_id,ai_action,metadata)
    values(t.project_id,t.created_by,t.points,'refund','Hoàn điểm bước phim chưa thực hiện','completed',t.id,'short_film_refund',jsonb_build_object('task_id',t.id));
  end if;
  update short_film_tasks set checkpoint=checkpoint||'{"settled":true}'::jsonb where id=t.id;
  update generation_jobs set status=t.status,phase=t.status,error=jsonb_build_object('stage',t.error),completed_at=now() where id=t.generation_job_id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.settle_film_failures() from public,anon,authenticated;
grant execute on function public.settle_film_failures() to service_role;
create function public.accept_film_batch(p_quotes uuid[],p_actor uuid,p_key uuid) returns jsonb language plpgsql set search_path=public as $$
declare q uuid; r jsonb; results jsonb:='[]';
begin
 if cardinality(p_quotes) not between 1 and 10 then raise exception 'INVALID_BATCH'; end if;
 for q in select unnest(p_quotes) order by 1 loop
  r:=accept_film_quote(q,p_actor,md5(p_key::text||q::text)::uuid);results:=results||jsonb_build_array(r);
 end loop;
 return results;
end $$;
revoke all on function public.accept_film_batch(uuid[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_film_batch(uuid[],uuid,uuid) to service_role;
