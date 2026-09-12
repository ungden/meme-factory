-- Service-only jobs: clients cannot write quotes, billing, leases or provider data.
create table public.watermark_ai_jobs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id), workspace_version integer not null,
 mode text not null check(mode in ('remove_background','generate')),
 prompt text not null, model text not null default 'openai/gpt-image-1.5/text-to-image',
 input_image text, output_image text,
 status text not null default 'quoted' check(status in ('quoted','queued','processing','waiting','saving','needs_review','completed','failed')),
 max_points integer not null check(max_points between 1 and 100),
 charged_points integer, provider_cost_usd numeric, usage jsonb,
 output_url text, error text, request_id text,
 lease_owner uuid, lease_expires_at timestamptz, provider_started_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 next_poll_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '15 minutes',
 settled_at timestamptz
);
alter table public.watermark_ai_jobs enable row level security;
revoke all on public.watermark_ai_jobs from anon, authenticated;
grant all on public.watermark_ai_jobs to service_role;
create index watermark_ai_project_recent on public.watermark_ai_jobs(project_id, created_at desc);
create unique index watermark_ai_one_active on public.watermark_ai_jobs(project_id)
 where status in ('queued','processing','waiting','saving','needs_review');

create function public.quote_watermark_ai(p_project uuid,p_user uuid,p_workspace integer,p_mode text,p_prompt text,p_input text,p_points integer,p_model text,p_cost numeric)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare q uuid;
begin
 perform 1 from projects where id=p_project and user_id=p_user and workspace_version=p_workspace for update;
 if not found then raise exception 'WORKSPACE_FORBIDDEN'; end if;
 if (select count(*) from watermark_ai_jobs where user_id=p_user and created_at > now()-interval '1 day')>=30 then raise exception 'RATE_LIMIT'; end if;
 insert into watermark_ai_jobs(project_id,user_id,workspace_version,mode,prompt,input_image,max_points,model,provider_cost_usd)
 values(p_project,p_user,p_workspace,p_mode,p_prompt,p_input,p_points,p_model,p_cost) returning id into q;
 return q;
end $$;

create function public.accept_watermark_ai(p_id uuid,p_project uuid,p_user uuid,p_workspace integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare j watermark_ai_jobs; payment jsonb;
begin
 perform 1 from projects where id=p_project and user_id=p_user and workspace_version=p_workspace for update;
 if not found then raise exception 'WORKSPACE_FORBIDDEN'; end if;
 select * into j from watermark_ai_jobs where id=p_id and project_id=p_project and user_id=p_user and workspace_version=p_workspace for update;
 if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
 if j.status<>'quoted' then return jsonb_build_object('id',j.id,'status',j.status); end if;
 if j.expires_at<now() then raise exception 'QUOTE_EXPIRED'; end if;
 if exists(select 1 from watermark_ai_jobs where project_id=p_project and status in ('queued','processing','waiting','saving','needs_review')) then raise exception 'JOB_ACTIVE'; end if;
 payment:=atomic_deduct_project_points(p_project,p_user,j.max_points,'Giữ điểm AI watermark',j.id,'watermark_ai',jsonb_build_object('jobId',j.id));
 if not coalesce((payment->>'success')::boolean,false) then raise exception 'INSUFFICIENT_POINTS'; end if;
 update watermark_ai_jobs set status='queued',updated_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'status','queued');
end $$;

create function public.claim_watermark_ai() returns setof public.watermark_ai_jobs language plpgsql set search_path=public,pg_temp as $$
declare chosen uuid;
begin
 perform pg_advisory_xact_lock(hashtext('watermark_ai_worker'));
 -- An uncertain submission cannot be re-sent; a known prediction can be polled.
 update watermark_ai_jobs set status='needs_review',error='Mất kết nối khi AI đang tạo. Điểm đang được đối soát; không tạo lại tự động.',lease_owner=null,lease_expires_at=null,updated_at=now()
 where status='processing' and lease_expires_at<now() and provider_started_at is not null and request_id is null;
 update watermark_ai_jobs set status='waiting',lease_owner=null,lease_expires_at=null where status='processing' and lease_expires_at<now() and request_id is not null;
 update watermark_ai_jobs set status='queued',lease_owner=null,lease_expires_at=null
 where status='processing' and lease_expires_at<now() and provider_started_at is null;
 -- Quotes never trigger provider work. Discard their image payload after expiry.
 update watermark_ai_jobs set input_image=null where status='quoted' and expires_at<now() and input_image is not null;
 if exists(select 1 from watermark_ai_jobs where status in ('processing','waiting','saving') and lease_expires_at>now()) then return; end if;
 select id into chosen from watermark_ai_jobs where next_poll_at<=now() and (status='queued' or (status in ('saving','waiting') and (lease_expires_at is null or lease_expires_at<now())))
 order by created_at for update skip locked limit 1;
 if chosen is null then return; end if;
 return query update watermark_ai_jobs set status=case when status='queued' then 'processing' else status end,
 lease_owner=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',updated_at=now() where id=chosen returning *;
end $$;

create function public.finish_watermark_ai(p_id uuid,p_owner uuid,p_status text,p_points integer,p_url text,p_error text)
returns boolean language plpgsql set search_path=public,pg_temp as $$
declare j watermark_ai_jobs;
begin
 select * into j from watermark_ai_jobs where id=p_id for update;
 if not found then return false; end if;
 if j.settled_at is not null then return true; end if;
 if j.lease_owner is distinct from p_owner or j.lease_expires_at<=now() then return false; end if;
 if p_status not in ('completed','failed') or p_points<0 or p_points>j.max_points then raise exception 'INVALID_SETTLEMENT'; end if;
 if p_status='completed' and (p_url is null or j.status<>'saving') then raise exception 'OUTPUT_REQUIRED'; end if;
 if j.max_points>p_points then
 perform atomic_refund_project_points(j.project_id,j.user_id,j.max_points-p_points,'Hoàn phần giữ điểm AI watermark',gen_random_uuid(),'watermark_ai_refund',jsonb_build_object('jobId',j.id));
 end if;
 update watermark_ai_jobs set status=p_status,charged_points=p_points,output_url=p_url,error=p_error,settled_at=now(),updated_at=now(),
 input_image=null,output_image=null,lease_owner=null,lease_expires_at=null where id=p_id;
 return true;
end $$;

revoke all on function public.quote_watermark_ai(uuid,uuid,integer,text,text,text,integer,text,numeric),public.accept_watermark_ai(uuid,uuid,uuid,integer),public.claim_watermark_ai(),public.finish_watermark_ai(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.quote_watermark_ai(uuid,uuid,integer,text,text,text,integer,text,numeric),public.accept_watermark_ai(uuid,uuid,uuid,integer),public.claim_watermark_ai(),public.finish_watermark_ai(uuid,uuid,text,integer,text,text) to service_role;
