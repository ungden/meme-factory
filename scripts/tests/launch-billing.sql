-- Caller wraps migration + this fixture in BEGIN/ROLLBACK. No real money moves.
DO $$
DECLARE u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); receipt jsonb; balance_before numeric; f record;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('atomic_confirm_topup','atomic_buy_points','atomic_refund_points','atomic_refund_project_points','atomic_deduct_project_points','atomic_deposit_points_to_project','claim_free_trial','confirm_sepay_topup')
  LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Client can mutate money'; END IF;
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Server billing denied'; END IF;
  END LOOP;
  INSERT INTO auth.users(id,email) VALUES(u,'billing-qa-'||u||'@example.invalid');
  INSERT INTO public.wallets(user_id,balance) VALUES(u,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT balance INTO balance_before FROM public.wallets WHERE user_id=u;
  INSERT INTO public.topup_orders(id,user_id,amount,status,payment_id) VALUES(a,u,10000,'pending','QA_BANK'),(b,u,10000,'pending','QA_BANK');
  receipt:=public.confirm_sepay_topup('980001',left(a::text,8),1,ARRAY['QA_BANK']);
  IF receipt->>'error'<>'AMOUNT_MISMATCH' THEN RAISE EXCEPTION 'Underpayment credited'; END IF;
  receipt:=public.confirm_sepay_topup('980001',left(a::text,8),10000,ARRAY['OTHER_BANK']);
  IF receipt->>'error'<>'ACCOUNT_MISMATCH' THEN RAISE EXCEPTION 'Wrong account credited'; END IF;
  IF EXISTS(SELECT 1 FROM topup_payment_events WHERE order_id=a) THEN RAISE EXCEPTION 'Rejected receipt persisted'; END IF;
  receipt:=public.confirm_sepay_topup('980001',left(a::text,8),10000,ARRAY['QA_BANK']);
  IF receipt->>'success'<>'true' THEN RAISE EXCEPTION 'Valid payment rejected: %',receipt; END IF;
  receipt:=public.confirm_sepay_topup('980001',left(a::text,8),10000,ARRAY['QA_BANK']);
  IF receipt->>'already_completed'<>'true' THEN RAISE EXCEPTION 'Duplicate was not recognized'; END IF;
  receipt:=public.confirm_sepay_topup('980001',left(b::text,8),10000,ARRAY['QA_BANK']);
  IF receipt->>'error'<>'PAYMENT_EVENT_CONFLICT' THEN RAISE EXCEPTION 'Payment reused for another order'; END IF;
  IF (SELECT balance FROM wallets WHERE user_id=u)<>balance_before+10000 THEN RAISE EXCEPTION 'Incorrect credited balance'; END IF;
  IF (SELECT count(*) FROM transactions WHERE user_id=u AND type='topup')<>1 THEN RAISE EXCEPTION 'Duplicate ledger entry'; END IF;
  UPDATE topup_orders SET status='rejected' WHERE id=b;
  receipt:=public.confirm_sepay_topup('980002',left(b::text,8),10000,ARRAY['QA_BANK']);
  IF receipt->>'error'<>'ORDER_NOT_PENDING' THEN RAISE EXCEPTION 'Rejected order credited automatically'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.atomic_confirm_topup(gen_random_uuid()); RAISE EXCEPTION 'Anonymous topup allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
