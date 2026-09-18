-- Đếm lượt gọi theo cửa sổ thời gian, để chặn lạm dụng các endpoint tốn tiền.
--
-- Không có giới hạn nào ở tầng HTTP: một script có phiên đăng nhập hợp lệ có
-- thể gọi liên tục cho tới khi hết điểm — hoặc, với những endpoint miễn phí như
-- gợi ý nhân vật, cho tới khi hết quota Gemini của cả hệ thống.
--
-- Dùng Postgres thay vì thêm một dịch vụ đếm bên ngoài: mọi instance serverless
-- đều đã nối sẵn vào đây, và một dòng đếm mỗi người mỗi phút là chi phí không
-- đáng kể so với một lượt gọi AI.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Trả về {allowed, remaining, reset_in}. Cửa sổ trượt theo kiểu "fixed window":
-- đủ tốt để chặn lạm dụng, và rẻ hơn nhiều so với đếm từng lượt.
create or replace function public.rate_limit_hit(
  _key text,
  _limit integer,
  _window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _row record;
  _now timestamptz := now();
begin
  if _limit <= 0 or _window_seconds <= 0 then
    return jsonb_build_object('allowed', true, 'remaining', _limit, 'reset_in', 0);
  end if;

  insert into rate_limits(key, window_start, hits)
  values (_key, _now, 1)
  on conflict (key) do update
    set hits = case
          when rate_limits.window_start < _now - make_interval(secs => _window_seconds) then 1
          else rate_limits.hits + 1
        end,
        window_start = case
          when rate_limits.window_start < _now - make_interval(secs => _window_seconds) then _now
          else rate_limits.window_start
        end
  returning hits, window_start into _row;

  return jsonb_build_object(
    'allowed', _row.hits <= _limit,
    'remaining', greatest(0, _limit - _row.hits),
    'reset_in', greatest(0, _window_seconds - extract(epoch from (_now - _row.window_start))::integer)
  );
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Dọn những cửa sổ đã hết hạn để bảng không phình theo thời gian.
create index if not exists rate_limits_window_start on public.rate_limits(window_start);
