CREATE OR REPLACE FUNCTION atomic_deduct_points(
  _user_id UUID,
  _cost INTEGER,
  _description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _wallet RECORD;
  _new_points INTEGER;
BEGIN
  SELECT id, points INTO _wallet
  FROM wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF _wallet.points < _cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient points',
      'points', _wallet.points, 'required', _cost);
  END IF;

  _new_points := _wallet.points - _cost;

  UPDATE wallets
  SET points = _new_points, updated_at = NOW()
  WHERE id = _wallet.id;

  RETURN jsonb_build_object('success', true, 'points', _new_points, 'wallet_id', _wallet.id);
END;
$$;
