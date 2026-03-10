CREATE OR REPLACE FUNCTION atomic_confirm_topup(
  _order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _order RECORD;
  _wallet RECORD;
  _new_balance NUMERIC;
  _tx_description TEXT;
  _existing_tx RECORD;
BEGIN
  SELECT * INTO _order
  FROM topup_orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF _order.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  _tx_description := 'Nạp tiền (Mã: ' || UPPER(LEFT(_order_id::text, 8)) || ')';

  SELECT id INTO _existing_tx
  FROM transactions
  WHERE reference_id = 'topup_' || _order_id::text
  LIMIT 1;

  IF FOUND THEN
    UPDATE topup_orders SET status = 'completed', updated_at = NOW() WHERE id = _order_id;
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  SELECT id, balance INTO _wallet
  FROM wallets
  WHERE user_id = _order.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, balance) VALUES (_order.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id, balance INTO _wallet FROM wallets WHERE user_id = _order.user_id FOR UPDATE;
  END IF;

  _new_balance := _wallet.balance + _order.amount;

  UPDATE wallets
  SET balance = _new_balance, updated_at = NOW()
  WHERE id = _wallet.id;

  INSERT INTO transactions (user_id, amount, type, description, status, reference_id)
  VALUES (_order.user_id, _order.amount, 'topup', _tx_description, 'completed', 'topup_' || _order_id::text);

  UPDATE topup_orders
  SET status = 'completed', updated_at = NOW()
  WHERE id = _order_id;

  RETURN jsonb_build_object('success', true, 'balance', _new_balance, 'already_completed', false);
END;
$$;
