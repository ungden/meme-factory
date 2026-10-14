-- Một nguồn cho hồ sơ kênh.
--
-- Trước đây có hai nơi giữ "người xem / giọng kể / kênh kể chuyện gì":
--   * projects.audience, projects.brand_voice, projects.description — do bước
--     tạo kênh ghi, trang Cài đặt kênh sửa, meme đọc;
--   * channel_profiles.profile (audience, tone, positioning) — Studio phim tự
--     hỏi lại rồi ghi, kịch bản phim và meme ưu tiên đọc.
-- Hai bên lệch nhau: sửa ở Cài đặt kênh không tới được phim, còn Studio phim
-- hỏi lại điều bước tạo kênh đã hỏi.
--
-- Từ đây ba cột của `projects` là nguồn. `channel_profiles` vẫn là bản ghi có
-- phiên bản mà mỗi kịch bản ghim (đổi hồ sơ không được viết lại một bản nháp
-- đã trả tiền), nhưng nó đi theo `projects`: sửa ba cột là có phiên bản hồ sơ
-- mới. Không bỏ cột nào; mã cũ đọc chỗ nào cũng vẫn đúng.

-- 1. Kênh đã có hồ sơ phim: hồ sơ đó là thứ phim và meme đang thật sự dùng (mã
--    hiện tại ưu tiên hồ sơ hơn cột của projects), nên chép ngược về projects.
--    Như vậy trang Cài đặt kênh hiện đúng điều đang có hiệu lực và không bài
--    nào đổi giọng sau migration.
update public.projects p
set
  audience = coalesce(nullif(btrim(latest.profile->>'audience'), ''), p.audience),
  brand_voice = coalesce(nullif(btrim(latest.profile->>'tone'), ''), p.brand_voice),
  description = coalesce(nullif(btrim(latest.profile->>'positioning'), ''), p.description)
from (
  select distinct on (project_id, workspace_version) project_id, workspace_version, profile
  from public.channel_profiles
  order by project_id, workspace_version, version desc
) latest
where latest.project_id = p.id
  and latest.workspace_version = p.workspace_version
  and (
    p.audience is distinct from coalesce(nullif(btrim(latest.profile->>'audience'), ''), p.audience)
    or p.brand_voice is distinct from coalesce(nullif(btrim(latest.profile->>'tone'), ''), p.brand_voice)
    or p.description is distinct from coalesce(nullif(btrim(latest.profile->>'positioning'), ''), p.description)
  );

-- 2. Sửa ba cột thì hồ sơ phim có phiên bản mới mang giá trị mới. Giữ nguyên
--    mọi thứ khác của hồ sơ (vai, chỉ đạo hình ảnh, cờ khoá giọng…). Kênh chưa
--    có hồ sơ phim thì không làm gì: Studio phim tạo hồ sơ từ chính ba cột này
--    khi cần. Ô bị xoá trắng không xoá chữ trong hồ sơ, vì kịch bản phim bắt
--    buộc có đủ ba ý.
create or replace function public.sync_channel_profile_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base jsonb;
  next_version integer;
  next_profile jsonb;
begin
  select profile, version + 1 into base, next_version
  from channel_profiles
  where project_id = new.id and workspace_version = new.workspace_version
  order by version desc
  limit 1;
  if base is null then
    return new;
  end if;

  next_profile := base || jsonb_strip_nulls(jsonb_build_object(
    'audience', nullif(btrim(new.audience), ''),
    'tone', nullif(btrim(new.brand_voice), ''),
    'positioning', nullif(btrim(new.description), '')
  ));
  -- API hồ sơ kênh ghi hồ sơ trước rồi mới ghi projects: lúc đó hai bên đã khớp
  -- và không cần thêm phiên bản.
  if next_profile = base then
    return new;
  end if;

  insert into channel_profiles(project_id, workspace_version, version, profile)
  values (new.id, new.workspace_version, next_version, next_profile || jsonb_build_object('version', next_version))
  on conflict do nothing;
  return new;
end $$;

revoke all on function public.sync_channel_profile_from_project() from public, anon, authenticated;

drop trigger if exists projects_sync_channel_profile on public.projects;
create trigger projects_sync_channel_profile
  after update of audience, brand_voice, description on public.projects
  for each row
  when (
    old.audience is distinct from new.audience
    or old.brand_voice is distinct from new.brand_voice
    or old.description is distinct from new.description
  )
  execute function public.sync_channel_profile_from_project();
