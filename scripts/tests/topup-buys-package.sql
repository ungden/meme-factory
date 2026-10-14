-- Nạp tiền kèm gói: xác nhận chuyển khoản phải ra điểm, đúng một lần.
-- Caller bọc trong BEGIN/ROLLBACK; không có tiền hay điểm thật nào được phát.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  plain_order uuid;
  pack_order uuid;
  bal numeric;
  pts integer;
  purchases integer;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'topup-qa-' || u || '@example.invalid');

  -- Đơn nạp thường: chỉ có tiền, như trước.
  INSERT INTO public.topup_orders(user_id, amount, status, payment_id)
    VALUES (u, 10000, 'pending', 'QA') RETURNING id INTO plain_order;
  PERFORM public.atomic_confirm_topup(plain_order);
  SELECT balance, coalesce(points, 0) INTO bal, pts FROM public.wallets WHERE user_id = u;
  IF bal <> 10000 OR pts <> 0 THEN RAISE EXCEPTION 'Đơn thường: ví % đ, % điểm', bal, pts; END IF;

  -- Đơn từ hộp "Cần thêm điểm": tiền vào rồi đổi ngay ra điểm của gói.
  INSERT INTO public.topup_orders(user_id, amount, status, payment_id, buy_package_id, buy_points, buy_key)
    VALUES (u, 50000, 'pending', 'QA', 'basic', 100, gen_random_uuid()) RETURNING id INTO pack_order;
  PERFORM public.atomic_confirm_topup(pack_order);
  SELECT balance, points INTO bal, pts FROM public.wallets WHERE user_id = u;
  IF bal <> 10000 OR pts <> 100 THEN RAISE EXCEPTION 'Đơn có gói: ví % đ, % điểm (mong đợi 10000 đ, 100 điểm)', bal, pts; END IF;

  -- Ngân hàng gửi lại, quản trị bấm duyệt lần nữa: không mua thêm lần nào.
  PERFORM public.atomic_confirm_topup(pack_order);
  UPDATE public.topup_orders SET status = 'pending' WHERE id = pack_order;
  UPDATE public.topup_orders SET status = 'completed' WHERE id = pack_order;
  SELECT balance, points INTO bal, pts FROM public.wallets WHERE user_id = u;
  IF bal <> 10000 OR pts <> 100 THEN RAISE EXCEPTION 'Xác nhận lặp đã mua thêm: ví % đ, % điểm', bal, pts; END IF;

  SELECT count(*) INTO purchases FROM public.point_purchase_receipts WHERE user_id = u;
  IF purchases <> 1 THEN RAISE EXCEPTION 'Có % lần mua gói, mong đợi 1', purchases; END IF;
END $$;
