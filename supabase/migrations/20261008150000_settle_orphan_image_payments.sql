-- Route tạo ảnh trừ điểm rồi mới ghi generation_jobs; sweeper cũ chỉ hoàn theo
-- job. Tiến trình chết đúng giữa hai bước thì khoản trừ không có job nào để
-- hoàn — người dùng mất điểm. Hàm này hoàn những khoản trừ ảnh đó.
--
-- Chỉ xét khoản từ 2026-10-08: khoản cũ hơn có từ trước khi app ghi job, nên
-- không có job là bình thường chứ không phải lỗi. Hàm hoàn không tự kiểm đã
-- trừ hay chưa, nên điều kiện "có khoản trừ" phải nằm ở đây.
create or replace function public.settle_orphan_image_payments(_stale_before timestamptz, _limit integer default 25)
returns integer language plpgsql set search_path=public as $$
declare tx project_transactions; n integer:=0;
begin
  if _limit<1 or _limit>100 then raise exception 'INVALID_LIMIT'; end if;
  for tx in
    select t.* from project_transactions t
    where t.type='payment' and t.status='completed' and t.request_id is not null
      and t.ai_action in ('meme','character','background')
      and t.created_at >= timestamptz '2026-10-08 00:00:00+07' and t.created_at < _stale_before
      and not exists(select 1 from generation_jobs j where j.id=t.request_id)
      and not exists(select 1 from project_transactions r where r.request_id=t.request_id and r.type='refund')
    order by t.created_at
    limit _limit
    for update of t skip locked
  loop
    perform public.atomic_refund_project_points(
      tx.project_id, tx.actor_user_id, abs(tx.amount),
      format('Hoàn %s điểm — lượt tạo ảnh không hoàn tất', abs(tx.amount)),
      tx.request_id, 'refund',
      jsonb_build_object('reason','sweeper_orphan_payment','ai_action',tx.ai_action));
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.settle_orphan_image_payments(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.settle_orphan_image_payments(timestamptz,integer) to service_role;
