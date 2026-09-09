-- All wallet mutation entrypoints are server-only, including legacy overloads.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'atomic_buy_points','atomic_buy_project_points','atomic_confirm_topup',
      'atomic_deduct_points','atomic_deduct_project_points','atomic_deposit_points_to_project',
      'atomic_refund_points','atomic_refund_project_points','claim_free_trial',
      'get_pending_topup_by_id_prefix')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER',f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp',f.signature);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.topup_payment_events (
  event_id text PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.topup_orders(id),
  amount numeric NOT NULL CHECK(amount>0),
  account text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.topup_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.topup_payment_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.topup_payment_events TO service_role;

-- Authenticated webhook only; do not guess an owner from VA + amount alone.
-- The code, bank account, full amount and provider event ID must agree.
CREATE OR REPLACE FUNCTION public.confirm_sepay_topup(
  p_event_id text, p_order_prefix text, p_amount numeric, p_accounts text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE o public.topup_orders; receipt public.topup_payment_events; matches integer; result jsonb;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^[0-9]{1,30}$' OR p_order_prefix IS NULL
    OR p_order_prefix !~ '^[a-f0-9]{8}$' OR p_amount IS NULL OR p_amount<=0
    OR p_amount<>trunc(p_amount) OR coalesce(array_length(p_accounts,1),0)=0 THEN
    RETURN jsonb_build_object('success',false,'error','INVALID_PAYMENT');
  END IF;
  -- Lock event before order, so concurrent duplicates serialize even across orders.
  PERFORM pg_advisory_xact_lock(hashtextextended('sepay:'||p_event_id,0));
  SELECT * INTO receipt FROM public.topup_payment_events WHERE event_id=p_event_id;
  IF FOUND THEN
    IF left(receipt.order_id::text,8)<>p_order_prefix OR receipt.amount<>p_amount
      OR NOT(receipt.account=ANY(p_accounts)) THEN
      RETURN jsonb_build_object('success',false,'error','PAYMENT_EVENT_CONFLICT');
    END IF;
    RETURN jsonb_build_object('success',true,'already_completed',true,'order_id',receipt.order_id);
  END IF;
  SELECT count(*) INTO matches FROM public.topup_orders WHERE left(id::text,8)=p_order_prefix;
  IF matches<>1 THEN RETURN jsonb_build_object('success',false,'error','ORDER_NOT_UNIQUE'); END IF;
  SELECT * INTO o FROM public.topup_orders WHERE left(id::text,8)=p_order_prefix FOR UPDATE;
  IF o.amount<>p_amount THEN RETURN jsonb_build_object('success',false,'error','AMOUNT_MISMATCH'); END IF;
  IF o.payment_id IS NULL OR NOT(o.payment_id=ANY(p_accounts)) THEN
    RETURN jsonb_build_object('success',false,'error','ACCOUNT_MISMATCH');
  END IF;
  IF o.status<>'pending' THEN RETURN jsonb_build_object('success',false,'error','ORDER_NOT_PENDING'); END IF;
  INSERT INTO public.topup_payment_events(event_id,order_id,amount,account)
    VALUES(p_event_id,o.id,p_amount,o.payment_id);
  result:=public.atomic_confirm_topup(o.id);
  IF NOT coalesce((result->>'success')::boolean,false) THEN
    RAISE EXCEPTION 'TOPUP_CONFIRM_FAILED'; -- rolls back receipt and wallet together
  END IF;
  RETURN result||jsonb_build_object('order_id',o.id);
END $$;
REVOKE ALL ON FUNCTION public.confirm_sepay_topup(text,text,numeric,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sepay_topup(text,text,numeric,text[]) TO service_role;

-- New price policy only: never rewrite historic wallets, purchases or accepted quotes.
INSERT INTO public.system_settings(key,value,updated_at)
VALUES ('point_costs','{"content":0,"character":5,"meme":6,"background":8}'::jsonb,now()),
       ('billing_policy','{"version":"2026-09-10","markupMultiplier":1.3,"pointValueVnd":500,"rounding":"ceil_whole_point"}'::jsonb,now())
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
