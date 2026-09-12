-- Direct OpenAI uses synchronous image requests, not WaveSpeed predictions.
alter table public.watermark_ai_jobs alter column model set default 'gpt-image-1.5';
alter table public.watermark_ai_jobs add constraint watermark_ai_openai_model check(model='gpt-image-1.5');
drop index public.watermark_ai_one_active;
create unique index watermark_ai_one_active on public.watermark_ai_jobs(project_id,workspace_version)
 where status in ('queued','processing','saving','needs_review');
create or replace function public.accept_watermark_ai(p_id uuid,p_project uuid,p_user uuid,p_workspace integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare j watermark_ai_jobs; payment jsonb;
begin
 perform 1 from projects where id=p_project and user_id=p_user and workspace_version=p_workspace for update;
 if not found then raise exception 'WORKSPACE_FORBIDDEN'; end if;
 select * into j from watermark_ai_jobs where id=p_id and project_id=p_project and user_id=p_user and workspace_version=p_workspace for update;
 if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
 if j.status<>'quoted' then return jsonb_build_object('id',j.id,'status',j.status); end if;
 if j.expires_at<now() then raise exception 'QUOTE_EXPIRED'; end if;
 if exists(select 1 from watermark_ai_jobs where project_id=p_project and workspace_version=p_workspace and status in ('queued','processing','saving','needs_review')) then raise exception 'JOB_ACTIVE'; end if;
 payment:=atomic_deduct_project_points(p_project,p_user,j.max_points,'Giữ điểm AI watermark',j.id,'watermark_ai',jsonb_build_object('jobId',j.id));
 if not coalesce((payment->>'success')::boolean,false) then raise exception 'INSUFFICIENT_POINTS'; end if;
 update watermark_ai_jobs set status='queued',updated_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'status','queued');
end $$;

create or replace function public.claim_watermark_ai() returns setof public.watermark_ai_jobs language plpgsql set search_path=public,pg_temp as $$
declare chosen uuid;
begin
 perform pg_advisory_xact_lock(hashtext('watermark_ai_worker'));
 -- An uncertain submission cannot be re-sent; a known prediction can be polled.
 update watermark_ai_jobs set status='needs_review',error='Mất kết nối khi AI đang tạo. Điểm đang được đối soát; không tạo lại tự động.',lease_owner=null,lease_expires_at=null,updated_at=now()
 where status='processing' and lease_expires_at<now() and provider_started_at is not null ;
 update watermark_ai_jobs set status='queued',lease_owner=null,lease_expires_at=null
 where status='processing' and lease_expires_at<now() and provider_started_at is null;
 -- Quotes never trigger provider work. Discard their image payload after expiry.
 update watermark_ai_jobs set input_image=null where status='quoted' and expires_at<now() and input_image is not null;
 if exists(select 1 from watermark_ai_jobs where status in ('processing','saving') and lease_expires_at>now()) then return; end if;
 select id into chosen from watermark_ai_jobs where next_poll_at<=now() and (status='queued' or (status='saving' and (lease_expires_at is null or lease_expires_at<now())))
 order by created_at for update skip locked limit 1;
 if chosen is null then return; end if;
 return query update watermark_ai_jobs set status=case when status='queued' then 'processing' else status end,
 lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',updated_at=now() where id=chosen returning *;
end $$;

