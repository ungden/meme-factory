CREATE OR REPLACE FUNCTION atomic_deduct_project_points(
  _project_id UUID,
  _actor_user_id UUID,
  _cost INTEGER,
  _description TEXT,
  _request_id UUID DEFAULT NULL,
  _ai_action TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _wallet RECORD;
  _new_points INTEGER;
  _has_access BOOLEAN;
  _tx_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = _project_id
      AND (
        p.user_id = _actor_user_id
        OR EXISTS (
          SELECT 1
          FROM project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = _actor_user_id
        )
      )
  ) INTO _has_access;

  IF NOT _has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  INSERT INTO project_wallets (project_id, points)
  VALUES (_project_id, 0)
  ON CONFLICT (project_id) DO NOTHING;

  SELECT id, points INTO _wallet
  FROM project_wallets
  WHERE project_id = _project_id
  FOR UPDATE;

  IF _wallet.points < _cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient project points',
      'points', _wallet.points,
      'required', _cost
    );
  END IF;

  _new_points := _wallet.points - _cost;

  UPDATE project_wallets
  SET points = _new_points, updated_at = NOW()
  WHERE id = _wallet.id;

  INSERT INTO project_transactions (
    project_id,
    actor_user_id,
    amount,
    type,
    description,
    status,
    request_id,
    ai_action,
    metadata
  )
  VALUES (
    _project_id,
    _actor_user_id,
    _cost,
    'payment',
    _description,
    'completed',
    _request_id,
    _ai_action,
    _metadata
  )
  RETURNING id INTO _tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'points', _new_points,
    'wallet_id', _wallet.id,
    'transaction_id', _tx_id
  );
END;
$$;
