-- Hoàn điểm phải là một lần, dù được gọi bao nhiêu lần với cùng request_id.
-- Caller bọc trong BEGIN/ROLLBACK; không có điểm thật nào đổi chủ.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  p uuid;
  req uuid := gen_random_uuid();
  first jsonb;
  second jsonb;
  rows_after integer;
  points_after integer;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'refund-qa-' || u || '@example.invalid');
  INSERT INTO public.projects(user_id, name) VALUES (u, 'Refund QA') RETURNING id INTO p;
  INSERT INTO public.project_wallets(project_id, points) VALUES (p, 100);

  first := public.atomic_refund_project_points(p, u, 50, 'QA hoàn điểm', req, 'refund', NULL);
  IF first->>'success' <> 'true' THEN RAISE EXCEPTION 'Lần hoàn đầu tiên thất bại: %', first; END IF;

  second := public.atomic_refund_project_points(p, u, 50, 'QA hoàn điểm', req, 'refund', NULL);
  IF second->>'duplicate' <> 'true' THEN RAISE EXCEPTION 'Hoàn lần hai không bị nhận ra là trùng: %', second; END IF;

  SELECT count(*) INTO rows_after FROM public.project_transactions WHERE request_id = req AND type = 'refund';
  IF rows_after <> 1 THEN RAISE EXCEPTION 'Sổ cái có % dòng hoàn cho một request_id', rows_after; END IF;

  SELECT points INTO points_after FROM public.project_wallets WHERE project_id = p;
  IF points_after <> 150 THEN RAISE EXCEPTION 'Ví cộng sai: % thay vì 150', points_after; END IF;

  -- Một lượt hợp lệ vẫn được phép có cả 'payment' lẫn 'refund' cùng request_id.
  INSERT INTO public.project_transactions(project_id, actor_user_id, amount, type, description, status, request_id)
  VALUES (p, u, 50, 'payment', 'QA trừ điểm', 'completed', req);

  -- Nhưng không được phép có hai dòng cùng (request_id, type).
  BEGIN
    INSERT INTO public.project_transactions(project_id, actor_user_id, amount, type, description, status, request_id)
    VALUES (p, u, 50, 'payment', 'QA trừ điểm lần hai', 'completed', req);
    RAISE EXCEPTION 'Index không chặn dòng payment trùng request_id';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;
