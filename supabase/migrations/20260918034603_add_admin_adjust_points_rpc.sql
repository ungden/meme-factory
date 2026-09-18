-- Admin cộng/trừ điểm cho một tài khoản.
--
-- Route cũ đọc số dư, cộng trong JavaScript, rồi ghi đè: hai admin bấm cùng lúc
-- thì một lần chỉnh biến mất, và nếu tiến trình chết giữa hai lời gọi thì ví
-- đổi mà sổ cái không ghi. Khoá dòng ví rồi làm cả hai việc trong một giao dịch.
create or replace function public.admin_adjust_points(
  _user_id uuid,
  _amount integer,
  _reason text,
  _admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _wallet record;
  _new_points integer;
begin
  if _amount is null or _amount = 0 then
    return jsonb_build_object('success', false, 'error', 'AMOUNT_REQUIRED');
  end if;
  if coalesce(btrim(_reason), '') = '' then
    return jsonb_build_object('success', false, 'error', 'REASON_REQUIRED');
  end if;

  select id, points into _wallet
  from wallets
  where user_id = _user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'WALLET_NOT_FOUND');
  end if;

  _new_points := _wallet.points + _amount;
  if _new_points < 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_POINTS',
      'points', _wallet.points
    );
  end if;

  update wallets set points = _new_points, updated_at = now() where id = _wallet.id;

  insert into transactions (user_id, amount, type, description, status)
  values (
    _user_id,
    _amount,
    case when _amount > 0 then 'topup' else 'payment' end,
    format('[Admin] %s (bởi %s)', btrim(_reason), coalesce(_admin_email, 'không rõ')),
    'completed'
  );

  return jsonb_build_object('success', true, 'points', _new_points);
end;
$$;

revoke all on function public.admin_adjust_points(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text, text) to service_role;
