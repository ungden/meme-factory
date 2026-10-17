DO $$
declare
 u uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); p uuid; r uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid();
 lease uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); revision integer; balance integer; candidate jsonb; request jsonb;
begin
 insert into auth.users(id,email) values(u,'review-'||u||'@example.invalid'),(stranger,'review-'||stranger||'@example.invalid');
 insert into projects(user_id,name) values(u,'Battle review QA') returning id into p;
 insert into project_wallets(project_id,points) values(p,1000) on conflict(project_id) do update set points=1000;
 perform create_battle_rap_run(r,p,u,1,'{}',100);
 if (select state#>>'{review,version}' from battle_rap_runs where id=r) is distinct from '1' then raise exception 'New run skipped review by default'; end if;
 insert into battle_rap_runs(id,project_id,created_by,workspace_version,input,state,budget_points) values(legacy,p,u,1,'{}','{}',100);
 if (select state ? 'review' from battle_rap_runs where id=legacy) then raise exception 'Legacy state was modified'; end if;
 delete from battle_rap_runs where id=legacy;

 update battle_rap_runs set status='running',lease_owner=lease,lease_expires_at=now()+interval '5 minutes' where id=r;
 candidate:=(select jsonb_set(state,'{review,revision}','1') from battle_rap_runs where id=r);
 perform checkpoint_battle_rap_run(r,lease,candidate,'music','awaiting_review');
 if (select settled or lease_owner is not null from battle_rap_runs where id=r) then raise exception 'Review should hold budget and release worker'; end if;
 select points into balance from project_wallets where project_id=p;
 if balance<>900 then raise exception 'Entering review refunded its reservation'; end if;
 if exists(select 1 from claim_battle_rap_run()) then raise exception 'Worker claimed a run waiting for review'; end if;
 begin
  perform control_battle_rap_run(r,p,u,'resume',gen_random_uuid());
  raise exception 'Resume skipped a review gate';
 exception when raise_exception then if sqlerrm<>'BATTLE_RESUME_INVALID' then raise; end if; end;
 perform control_battle_rap_run(r,p,u,'increase_budget',req,120);
 perform control_battle_rap_run(r,p,u,'increase_budget',req,120);
 if (select status from battle_rap_runs where id=r)<>'awaiting_review' then raise exception 'Increasing budget skipped a review gate'; end if;
 select points into balance from project_wallets where project_id=p;
 if balance<>880 then raise exception 'Review budget increase did not debit exactly once'; end if;

 candidate:=jsonb_set(candidate,'{review,revision}','2');
 request:='{"action":"approveStage","revision":1,"musicMode":"upload"}'; req:=gen_random_uuid();
 begin
  perform edit_battle_rap_review(r,p,stranger,1,1,req,request,candidate,'music','awaiting_music');
  raise exception 'Stranger edited review';
 exception when raise_exception then if sqlerrm<>'BATTLE_ACCESS_CHANGED' then raise; end if; end;
 begin
  perform edit_battle_rap_review(r,p,u,2,1,req,request,candidate,'music','awaiting_music');
  raise exception 'Old workspace edited review';
 exception when raise_exception then if sqlerrm<>'BATTLE_ACCESS_CHANGED' then raise; end if; end;
 update battle_rap_runs set lease_owner=lease,lease_expires_at=now()+interval '5 minutes' where id=r;
 begin
  perform edit_battle_rap_review(r,p,u,1,1,req,request,candidate,'music','awaiting_music');
  raise exception 'Review edited an active lease';
 exception when raise_exception then if sqlerrm<>'BATTLE_BUSY' then raise; end if; end;
 update battle_rap_runs set lease_owner=null,lease_expires_at=null where id=r;
 perform edit_battle_rap_review(r,p,u,1,1,req,request,candidate,'music','awaiting_music');
 perform edit_battle_rap_review(r,p,u,1,1,req,request,candidate,'music','awaiting_music');
 select (state#>>'{review,revision}')::integer into revision from battle_rap_runs where id=r;
 if revision<>2 or (select count(*) from battle_rap_review_actions where request_id=req)<>1 then raise exception 'Retried review applied twice'; end if;
 begin
  perform edit_battle_rap_review(r,p,u,1,1,req,'{"action":"regenerateAsset"}',candidate,'references','queued');
  raise exception 'Request key reused with changed action';
 exception when raise_exception then if sqlerrm<>'BATTLE_REQUEST_REUSED' then raise; end if; end;
 begin
  perform edit_battle_rap_review(r,p,u,1,1,gen_random_uuid(),request,candidate,'music','awaiting_music');
  raise exception 'Stale review accepted';
 exception when raise_exception then if sqlerrm<>'BATTLE_REVIEW_STALE' then raise; end if; end;

 req:=gen_random_uuid(); request:='{"action":"attachMusic","revision":2}';
 candidate:=jsonb_set(candidate,'{review,revision}','3');
 perform edit_battle_rap_review(r,p,u,1,2,req,request,candidate,'ingest','queued');
 perform edit_battle_rap_review(r,p,u,1,2,req,request,candidate,'ingest','queued');
 if (select state#>>'{review,revision}' from battle_rap_runs where id=r) <> '3' then raise exception 'Upload retry changed revision'; end if;
 update battle_rap_runs set status='awaiting_review' where id=r;
 begin
  perform edit_battle_rap_review(r,p,u,1,3,gen_random_uuid(),'{"action":"approveStage"}',candidate,'references','queued');
  raise exception 'Review revision did not advance';
 exception when raise_exception then if sqlerrm<>'BATTLE_REVIEW_INVALID' then raise; end if; end;
 update battle_rap_runs set settled=true where id=r;
 begin
  perform edit_battle_rap_review(r,p,u,1,3,gen_random_uuid(),'{"action":"approveStage"}',jsonb_set(candidate,'{review,revision}','4'),'references','queued');
  raise exception 'Settled review accepted';
 exception when raise_exception then if sqlerrm<>'BATTLE_REVIEW_STALE' then raise; end if; end;
 update battle_rap_runs set settled=false where id=r;
 perform control_battle_rap_run(r,p,u,'cancel',gen_random_uuid());
 perform control_battle_rap_run(r,p,u,'cancel',gen_random_uuid());
 select points into balance from project_wallets where project_id=p;
 if balance<>1000 then raise exception 'Cancelled review reservation was not refunded exactly once'; end if;
 if has_function_privilege('authenticated','public.edit_battle_rap_review(uuid,uuid,uuid,integer,integer,uuid,jsonb,jsonb,text,text)','EXECUTE') then raise exception 'Client can overwrite review state'; end if;
 if has_table_privilege('authenticated','public.battle_rap_review_actions','SELECT') or has_table_privilege('authenticated','public.battle_rap_review_actions','INSERT') then raise exception 'Client can access receipts'; end if;
end $$;

DO $$
declare u uuid:=gen_random_uuid(); p uuid; r uuid:=gen_random_uuid(); balance integer;
begin
 insert into auth.users(id,email) values(u,'review-wait-'||u||'@example.invalid');
 insert into projects(user_id,name) values(u,'Review wait QA') returning id into p;
 insert into project_wallets(project_id,points) values(p,1000) on conflict(project_id) do update set points=1000;
 perform create_battle_rap_run(r,p,u,1,'{}',100);
 update battle_rap_runs set status='awaiting_review',updated_at=now()-interval '25 hours' where id=r;
 perform sweep_battle_rap_runs();
 if (select status from battle_rap_runs where id=r)<>'awaiting_review' then raise exception 'Intentional review expired in 24 hours'; end if;
 update battle_rap_runs set updated_at=now()-interval '8 days' where id=r;
 perform sweep_battle_rap_runs(); perform sweep_battle_rap_runs();
 select points into balance from project_wallets where project_id=p;
 if balance<>1000 or not (select settled from battle_rap_runs where id=r) then raise exception 'Expired review did not refund exactly once'; end if;
 r:=gen_random_uuid();
 perform create_battle_rap_run(r,p,u,1,'{}',100);
 update battle_rap_runs set status='awaiting_review' where id=r;
 update projects set workspace_version=2 where id=p;
 perform sweep_battle_rap_runs();
 if (select status from battle_rap_runs where id=r)<>'failed' then raise exception 'Lost access kept a review reservation'; end if;
 select points into balance from project_wallets where project_id=p;
 if balance<>1000 then raise exception 'Lost access did not refund review'; end if;
end $$;
