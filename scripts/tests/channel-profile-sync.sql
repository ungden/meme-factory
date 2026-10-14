-- Hồ sơ kênh một nguồn: sửa người xem / giọng kể / kênh kể gì ở projects là hồ
-- sơ phim có phiên bản mới; sửa thứ khác, hoặc kênh chưa có hồ sơ phim, thì
-- không. Caller bọc trong BEGIN/ROLLBACK.
DO $$
DECLARE
  u uuid := gen_random_uuid();
  p projects;
  bare projects;
  versions integer;
  latest jsonb;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'profile-qa-' || u || '@example.invalid');
  INSERT INTO public.projects(user_id, name, slug, audience, brand_voice, description)
    VALUES (u, 'Kênh QA hồ sơ', 'kenh-qa-ho-so-' || left(u::text, 8), 'Bố mẹ trẻ', 'Hài đời thường', 'Chuyện trong bếp')
    RETURNING * INTO p;
  INSERT INTO public.channel_profiles(project_id, workspace_version, version, profile)
    VALUES (p.id, p.workspace_version, 1, jsonb_build_object(
      'version', 1, 'audience', 'Bố mẹ trẻ', 'tone', 'Hài đời thường', 'positioning', 'Chuyện trong bếp',
      'roles', jsonb_build_array(jsonb_build_object('characterId', gen_random_uuid(), 'name', 'Bánh Bao', 'personality', 'lém')),
      'voicesLocked', true));

  -- Đổi tên kênh, logo: hồ sơ phim không đổi.
  UPDATE public.projects SET name = 'Kênh QA đổi tên', watermark_opacity = 0.5 WHERE id = p.id;
  SELECT count(*) INTO versions FROM public.channel_profiles WHERE project_id = p.id;
  IF versions <> 1 THEN RAISE EXCEPTION 'Sửa cột khác mà hồ sơ có % phiên bản', versions; END IF;

  -- Sửa người xem ở Cài đặt kênh: phiên bản 2 mang người xem mới, giữ vai và cờ.
  UPDATE public.projects SET audience = 'Dân văn phòng' WHERE id = p.id;
  SELECT profile INTO latest FROM public.channel_profiles WHERE project_id = p.id ORDER BY version DESC LIMIT 1;
  IF (latest->>'version')::int <> 2 OR latest->>'audience' <> 'Dân văn phòng' THEN
    RAISE EXCEPTION 'Hồ sơ không theo cột audience: %', latest;
  END IF;
  IF latest->>'tone' <> 'Hài đời thường' OR jsonb_array_length(latest->'roles') <> 1 OR latest->>'voicesLocked' <> 'true' THEN
    RAISE EXCEPTION 'Hồ sơ mới làm mất phần khác: %', latest;
  END IF;

  -- Ghi lại đúng giá trị đang có (API hồ sơ ghi hồ sơ trước rồi mới ghi projects):
  -- không thêm phiên bản.
  UPDATE public.projects SET audience = 'Dân văn phòng ', brand_voice = 'Hài đời thường' WHERE id = p.id;
  SELECT count(*) INTO versions FROM public.channel_profiles WHERE project_id = p.id;
  IF versions <> 2 THEN RAISE EXCEPTION 'Giá trị không đổi mà có thêm phiên bản (% bản)', versions; END IF;

  -- Xoá trắng ô "kênh kể gì": kịch bản cần đủ ba ý nên hồ sơ giữ chữ cũ.
  UPDATE public.projects SET description = '  ' WHERE id = p.id;
  SELECT count(*) INTO versions FROM public.channel_profiles WHERE project_id = p.id;
  IF versions <> 2 THEN RAISE EXCEPTION 'Ô trống đã xoá chữ trong hồ sơ phim'; END IF;

  -- Sửa giọng kể và kênh kể gì cùng lúc: một phiên bản, đủ cả hai.
  UPDATE public.projects SET brand_voice = 'Ấm áp', description = 'Chuyện đi chợ' WHERE id = p.id;
  SELECT profile INTO latest FROM public.channel_profiles WHERE project_id = p.id ORDER BY version DESC LIMIT 1;
  IF (latest->>'version')::int <> 3 OR latest->>'tone' <> 'Ấm áp' OR latest->>'positioning' <> 'Chuyện đi chợ' THEN
    RAISE EXCEPTION 'Sửa hai cột không ra đúng một phiên bản: %', latest;
  END IF;

  -- Kênh chưa làm phim: không tự sinh hồ sơ phim (Studio phim tạo khi cần).
  INSERT INTO public.projects(user_id, name, slug) VALUES (u, 'Kênh QA trống', 'kenh-qa-trong-' || left(u::text, 8)) RETURNING * INTO bare;
  UPDATE public.projects SET audience = 'Học sinh' WHERE id = bare.id;
  IF EXISTS (SELECT 1 FROM public.channel_profiles WHERE project_id = bare.id) THEN
    RAISE EXCEPTION 'Kênh chưa có hồ sơ phim lại được tạo hồ sơ';
  END IF;

  -- Người dùng thường không tự ghi được hồ sơ phim; chỉ đi qua projects.
  IF has_table_privilege('authenticated', 'channel_profiles', 'INSERT') THEN
    RAISE EXCEPTION 'Client ghi thẳng được channel_profiles';
  END IF;
END $$;
