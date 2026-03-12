CREATE OR REPLACE FUNCTION atomic_refund_project_points(
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
BEGIN
  INSERT INTO project_wallets (project_id, points)
  VALUES (_project_id, 0)
  ON CONFLICT (project_id) DO NOTHING;

  SELECT id, points INTO _wallet
  FROM project_wallets
  WHERE project_id = _project_id
  FOR UPDATE;

  _new_points := _wallet.points + _cost;

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
    'refund',
    _description,
    'completed',
    _request_id,
    COALESCE(_ai_action, 'refund'),
    _metadata
  );

  RETURN jsonb_build_object('success', true, 'points', _new_points);
END;
$$;
