CREATE OR REPLACE FUNCTION claim_free_trial(
  _user_id UUID,
  _free_points INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _wallet RECORD;
  _new_points INTEGER;
BEGIN
  SELECT id, points, free_trial_claimed INTO _wallet
  FROM wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, balance, points, free_trial_claimed)
    VALUES (_user_id, 0, _free_points, TRUE)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT id, points, free_trial_claimed INTO _wallet
    FROM wallets WHERE user_id = _user_id FOR UPDATE;

    IF _wallet.free_trial_claimed THEN
      RETURN jsonb_build_object('success', true, 'points', _wallet.points, 'already_claimed', false);
    END IF;
  END IF;

  IF _wallet.free_trial_claimed THEN
    RETURN jsonb_build_object('success', false, 'already_claimed', true, 'points', _wallet.points);
  END IF;

  _new_points := _wallet.points + _free_points;

  UPDATE wallets
  SET points = _new_points, free_trial_claimed = TRUE, updated_at = NOW()
  WHERE id = _wallet.id;

  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (_user_id, 0, 'refund', 'Tặng ' || _free_points || ' điểm dùng thử miễn phí', 'completed');

  RETURN jsonb_build_object('success', true, 'points', _new_points, 'already_claimed', false);
END;
$$;
