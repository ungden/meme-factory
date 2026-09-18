-- Chuyển hai hành vi riêng của kênh gia đình từ "so tên dự án" sang cờ trong hồ
-- sơ kênh: khoá giọng nhân vật lõi, và quy tắc xưng hô người bố.
--
-- Đây là lần cuối cùng tên dự án được dùng để nhận ra khách hàng này. Sau
-- migration, mã nguồn chỉ đọc cờ, nên đổi tên dự án không còn làm đổi hành vi
-- và khách khác cũng bật được cùng hành vi đó.
--
-- Lịch sử hồ sơ là bất biến: thêm một phiên bản mới thay vì sửa phiên bản cũ.
do $$
declare
  target record;
  base jsonb;
  next_version integer;
  next_profile jsonb;
begin
  for target in
    select id, workspace_version from public.projects
    where name = 'Bánh Bao & Đậu Đỏ'
  loop
    select profile, version + 1 into base, next_version
    from public.channel_profiles
    where project_id = target.id and workspace_version = target.workspace_version
    order by version desc limit 1;

    if base is null then
      raise exception 'FAMILY_CHANNEL_PROFILE_MISSING';
    end if;

    if coalesce((base->>'voicesLocked')::boolean, false)
       and base->>'terminologyRules' = 'family-father' then
      continue;
    end if;

    next_profile := base || jsonb_build_object(
      'version', next_version,
      'voicesLocked', true,
      'terminologyRules', 'family-father'
    );

    insert into public.channel_profiles(project_id, workspace_version, version, profile)
    values (target.id, target.workspace_version, next_version, next_profile);
  end loop;
end $$;
