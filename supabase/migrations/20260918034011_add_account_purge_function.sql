-- Xoá tài khoản: dọn sạch dữ liệu cá nhân trước khi xoá auth.users.
--
-- Chính sách bảo mật hứa người dùng xoá được tài khoản, nhưng 15 khoá ngoại
-- trỏ tới auth.users với ON DELETE RESTRICT — bất kỳ ai đã từng tạo nội dung
-- đều không xoá được. Hàm này dọn theo đúng thứ tự:
--
-- 1. Xoá dự án người đó sở hữu (cascade kéo theo toàn bộ nội dung bên trong).
-- 2. Rời khỏi dự án của người khác.
-- 3. Những bảng còn trỏ tới họ bằng khoá NOT NULL + RESTRICT chỉ còn nằm trong
--    dự án của NGƯỜI KHÁC. Dữ liệu đó là của chủ dự án, không phải dữ liệu cá
--    nhân của người rời đi, nên quyền tác giả được chuyển cho chủ dự án thay vì
--    xoá đồ của người khác.
--
-- Duyệt khoá ngoại động thay vì liệt kê tên bảng: danh sách cứng sẽ lạc hậu
-- ngay lần thêm bảng kế tiếp, và lần đó chỉ lộ ra khi một người dùng thật bấm
-- xoá tài khoản và nhận lỗi.
create or replace function public.purge_user_data(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  removed_projects integer := 0;
  reassigned integer := 0;
  blocked text[] := '{}';
  affected integer;
begin
  if _user_id is null then
    raise exception 'Thiếu user id';
  end if;

  delete from public.projects where user_id = _user_id;
  get diagnostics removed_projects = row_count;

  delete from public.project_members where user_id = _user_id;

  for rec in
    select c.conrelid as relid,
           c.conrelid::regclass::text as tbl,
           a.attname as col
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'r'
      and a.attnotnull
      and array_length(c.conkey, 1) = 1
      and c.connamespace = 'public'::regnamespace
  loop
    if exists (
      select 1 from pg_attribute pa
      where pa.attrelid = rec.relid
        and pa.attname = 'project_id'
        and pa.attnum > 0
        and not pa.attisdropped
    ) then
      execute format(
        'update %s t set %I = p.user_id from public.projects p where p.id = t.project_id and t.%I = $1',
        rec.tbl, rec.col, rec.col
      ) using _user_id;
      get diagnostics affected = row_count;
      reassigned := reassigned + affected;
    end if;

    execute format('select count(*) from %s where %I = $1', rec.tbl, rec.col)
      into affected using _user_id;
    if affected > 0 then
      blocked := blocked || format('%s.%s (%s)', rec.tbl, rec.col, affected);
    end if;
  end loop;

  -- wallets/transactions/topup_orders đều ON DELETE CASCADE từ auth.users nên
  -- không cần dọn tay ở đây.
  return jsonb_build_object(
    'removed_projects', removed_projects,
    'reassigned', reassigned,
    'blocked', to_jsonb(blocked)
  );
end;
$$;

revoke all on function public.purge_user_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_user_data(uuid) to service_role;
