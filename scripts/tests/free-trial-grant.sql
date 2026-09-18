-- Điểm tặng phải vào ví đúng một lần cho mỗi tài khoản.
-- Caller bọc trong BEGIN/ROLLBACK; không có điểm thật nào được phát.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  first jsonb;
  second jsonb;
  pts integer;
  tx integer;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'trial-qa-' || u || '@example.invalid');

  first := public.claim_free_trial(u, 20);
  IF (first->>'success') <> 'true' THEN
    RAISE EXCEPTION 'Lần tặng đầu tiên thất bại: %', first;
  END IF;

  -- Người dùng mở lại trang ví, đăng nhập ở thiết bị khác, hoặc callback xác
  -- nhận email chạy hai lần: không lần nào được tặng thêm.
  second := public.claim_free_trial(u, 20);
  IF (second->>'already_claimed') <> 'true' THEN
    RAISE EXCEPTION 'Lần tặng thứ hai không bị chặn: %', second;
  END IF;

  SELECT points INTO pts FROM public.wallets WHERE user_id = u;
  IF pts <> 20 THEN RAISE EXCEPTION 'Ví có % điểm, mong đợi 20', pts; END IF;

  SELECT count(*) INTO tx FROM public.transactions WHERE user_id = u;
  IF tx <> 1 THEN RAISE EXCEPTION 'Sổ cái có % dòng, mong đợi 1', tx; END IF;
END $$;
