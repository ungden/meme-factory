DO $$
declare
 u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); p uuid; p2 uuid;
 r uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); step_id uuid;
 reuse uuid:=gen_random_uuid(); spent integer; n integer;
begin
 insert into auth.users(id,email) values(u,'battle-'||u||'@example.invalid'),(other_user,'battle-'||other_user||'@example.invalid');
 insert into projects(user_id,name) values(u,'Battle QA') returning id into p;
 insert into projects(user_id,name) values(other_user,'Other Battle QA') returning id into p2;
 insert into project_wallets(project_id,points) values(p,1000),(p2,1000) on conflict(project_id) do update set points=1000;
 perform create_battle_rap_run(r,p,u,(select workspace_version from projects where id=p),'{}',100);
 perform create_battle_rap_run(r,p,u,(select workspace_version from projects where id=p),'{}',100);
 select points into spent from project_wallets where project_id=p;
 if spent<>900 then raise exception 'Battle reservation charged twice: %',spent; end if;
 begin
  perform create_battle_rap_run(r,p2,other_user,(select workspace_version from projects where id=p2),'{}',100);
  raise exception 'Run request crossed project boundary';
 exception when raise_exception then if sqlerrm<>'BATTLE_ACCESS_CHANGED' then raise; end if; end;

 update battle_rap_runs set status='running',lease_owner=lease,lease_expires_at=now()+interval '5 minutes' where id=r;
 select (begin_battle_rap_step(r,lease,'image:A',30)).id into step_id;
 perform begin_battle_rap_step(r,lease,'image:A',30);
 select points_used into spent from battle_rap_runs where id=r;
 if spent<>30 then raise exception 'Battle step charged twice'; end if;
 begin
  perform begin_battle_rap_step(r,gen_random_uuid(),'bad',1);
  raise exception 'Stale owner performed step';
 exception when raise_exception then if sqlerrm<>'BATTLE_LEASE_LOST' then raise; end if; end;
 begin
  perform begin_battle_rap_step(r,lease,'over-budget',71);
  raise exception 'Exceeded battle budget';
 exception when raise_exception then if sqlerrm<>'BATTLE_BUDGET_EXCEEDED' then raise; end if; end;
 perform save_battle_rap_step(r,lease,'image:A','completed','"saved-image"');
 perform begin_battle_rap_step(r,lease,'video:1',20);
 perform save_battle_rap_step(r,lease,'video:1','failed',null);
 perform save_battle_rap_step(r,lease,'video:1','failed',null);
 select points_used into spent from battle_rap_runs where id=r;
 if spent<>30 then raise exception 'Failed step cost not released once: %',spent; end if;
 perform checkpoint_battle_rap_run(r,lease,'{"retained":true}','video','failed','QA');
 select points into spent from project_wallets where project_id=p;
 if spent<>970 then raise exception 'Failed run did not refund unused budget: %',spent; end if;
 perform control_battle_rap_run(r,p,u,'resume',reuse);
 perform control_battle_rap_run(r,p,u,'resume',reuse);
 select points into spent from project_wallets where project_id=p;
 if spent<>900 then raise exception 'Resume charged twice or failed: %',spent; end if;
 if not (select state->>'retained'='true' from battle_rap_runs where id=r) then raise exception 'Resume lost checkpoint'; end if;
 update battle_rap_runs set status='needs_review' where id=r;
 reuse:=gen_random_uuid();
 perform control_battle_rap_run(r,p,u,'increase_budget',reuse,120);
 perform control_battle_rap_run(r,p,u,'increase_budget',reuse,120);
 select points into spent from project_wallets where project_id=p;
 if spent<>880 then raise exception 'Budget increase not charged exactly once: %',spent; end if;
 perform control_battle_rap_run(r,p,u,'cancel',gen_random_uuid());
 perform control_battle_rap_run(r,p,u,'cancel',gen_random_uuid());
 select points into spent from project_wallets where project_id=p;
 if spent<>970 then raise exception 'Cancel did not refund exactly once: %',spent; end if;

 -- Mã thanh toán từ việc khác không được biến thành mức chi miễn phí.
 begin
  perform create_battle_rap_run(reuse,p,u,(select workspace_version from projects where id=p),'{}',100);
  raise exception 'Reused unrelated ledger request';
 exception when raise_exception then if sqlerrm<>'BATTLE_REQUEST_REUSED' then raise; end if; end;
 select count(*) into n from battle_rap_steps where run_id=r and step_key='image:A';
 if n<>1 then raise exception 'Duplicate step rows'; end if;
 if has_function_privilege('authenticated','public.create_battle_rap_run(uuid,uuid,uuid,integer,jsonb,integer)','EXECUTE') then raise exception 'Client can reserve arbitrary actor wallet'; end if;
 if has_table_privilege('authenticated','public.battle_rap_runs','UPDATE') then raise exception 'Client can forge completed jobs'; end if;
end $$;

DO $$
declare u uuid:=gen_random_uuid(); p uuid; r uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); balance integer;
begin
 insert into auth.users(id,email) values(u,'battle-sweep-'||u||'@example.invalid');
 insert into projects(user_id,name) values(u,'Battle sweep QA') returning id into p;
 insert into project_wallets(project_id,points) values(p,1000) on conflict(project_id) do update set points=1000;
 perform create_battle_rap_run(r,p,u,(select workspace_version from projects where id=p),'{}',100);
 update battle_rap_runs set status='running',lease_owner=lease,lease_expires_at=now()+interval '5 minutes' where id=r;
 perform begin_battle_rap_step(r,lease,'image:A',30);
 perform save_battle_rap_step(r,lease,'image:A','uncertain',null);
 perform checkpoint_battle_rap_run(r,lease,'{}','references','needs_review','QA');
 begin
  perform control_battle_rap_run(r,p,u,'resume',gen_random_uuid());
  raise exception 'Uncertain submission was sent again';
 exception when raise_exception then if sqlerrm<>'BATTLE_SUBMISSION_UNCERTAIN' then raise; end if; end;
 update battle_rap_runs set updated_at=now()-interval '25 hours' where id=r;
 perform sweep_battle_rap_runs(); perform sweep_battle_rap_runs();
 select points into balance from project_wallets where project_id=p;
 if balance<>1000 then raise exception 'Sweeper did not refund stale unfulfilled work: %',balance; end if;
end $$;
