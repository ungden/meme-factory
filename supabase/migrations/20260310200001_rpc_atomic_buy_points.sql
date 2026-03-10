CREATE OR REPLACE FUNCTION atomic_buy_points(
  _user_id UUID,
  _price NUMERIC,
  _points_to_add INTEGER,
  _description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _wallet RECORD;
  _new_balance NUMERIC;
  _new_points INTEGER;
BEGIN
  SELECT id, balance, points INTO _wallet
  FROM wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF _wallet.balance < _price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'balance', _wallet.balance, 'required', _price);
  END IF;

  _new_balance := _wallet.balance - _price;
  _new_points := _wallet.points + _points_to_add;

  UPDATE wallets
  SET balance = _new_balance, points = _new_points, updated_at = NOW()
  WHERE id = _wallet.id;

  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (_user_id, -_price, 'payment', _description, 'completed');

  RETURN jsonb_build_object('success', true, 'balance', _new_balance, 'points', _new_points);
END;
$$;
