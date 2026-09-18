-- Hoàn điểm hai lần cho cùng một lượt.
--
-- `atomic_deduct_project_points` chống gọi trùng bằng request_id, nhưng
-- `atomic_refund_project_points` thì không kiểm gì cả: gọi hai lần là cộng điểm
-- hai lần. Ngày 09/09/2026 việc này đã xảy ra thật ba lần (207, 155, 207 điểm),
-- khi một lượt chạy phim được dọn lại trong lúc lượt trước chưa xong.
--
-- Hai lớp bảo vệ: hàm tự kiểm lần hoàn trước (khoá advisory theo request_id nên
-- hai lời gọi song song xếp hàng), và một unique index làm lưới chặn cuối.
create or replace function public.atomic_refund_project_points(
  _project_id uuid,
  _actor_user_id uuid,
  _cost integer,
  _description text,
  _request_id uuid default null,
  _ai_action text default null,
  _metadata jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _wallet record;
  _new_points integer;
  _tx_id uuid;
begin
  if _request_id is not null then
    perform pg_advisory_xact_lock(hashtext('refund:' || _request_id::text));
    select id into _tx_id
    from project_transactions
    where request_id = _request_id and type = 'refund'
    limit 1;
    if _tx_id is not null then
      select points into _new_points from project_wallets where project_id = _project_id;
      return jsonb_build_object(
        'success', true,
        'duplicate', true,
        'points', coalesce(_new_points, 0),
        'transaction_id', _tx_id
      );
    end if;
  end if;

  insert into project_wallets (project_id, points)
  values (_project_id, 0)
  on conflict (project_id) do nothing;

  select id, points into _wallet
  from project_wallets
  where project_id = _project_id
  for update;

  _new_points := _wallet.points + _cost;

  update project_wallets
  set points = _new_points, updated_at = now()
  where id = _wallet.id;

  insert into project_transactions (
    project_id, actor_user_id, amount, type, description, status,
    request_id, ai_action, metadata
  )
  values (
    _project_id, _actor_user_id, _cost, 'refund', _description, 'completed',
    _request_id, coalesce(_ai_action, 'refund'), _metadata
  )
  returning id into _tx_id;

  return jsonb_build_object('success', true, 'points', _new_points, 'transaction_id', _tx_id);
end;
$$;

-- Lưới chặn cuối. Chỉ áp cho giao dịch từ hôm nay trở đi: sổ cái là bằng chứng,
-- ba lần hoàn trùng của ngày 09/09 được giữ nguyên để đối soát thay vì xoá đi
-- cho vừa một index. Cặp (request_id, type) chứ không chỉ request_id, vì một
-- lượt hợp lệ có đúng một 'payment' và có thể có một 'refund' cùng mã.
create unique index if not exists project_transactions_request_type_once
  on public.project_transactions(request_id, type)
  where request_id is not null and created_at >= timestamptz '2026-09-18 00:00:00+00';
