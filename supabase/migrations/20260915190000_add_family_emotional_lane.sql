-- The channel can tell funny family shorts and earned cinematic/emotional
-- shorts. Keep profile history immutable; production writers read v11.
do $$
declare target record; base jsonb; next_profile jsonb;
begin
  for target in
    select id, workspace_version from public.projects
    where name = 'Bánh Bao & Đậu Đỏ'
  loop
    select profile into base from public.channel_profiles
      where project_id = target.id and workspace_version = target.workspace_version
      order by version desc limit 1;
    if base is null then raise exception 'FAMILY_CHANNEL_PROFILE_MISSING'; end if;
    next_profile := base || jsonb_build_object(
      'version', 11,
      'writingPolicyVersion', 'family-dialogue-12',
      'positioning', 'Gia đình Bánh Bao & Đậu Đỏ có cả tập hài tương phản và tập cinematic cảm động. Tập hài khai thác đảo thường thức hoặc parody thế giới người lớn; tập cảm động khai thác ký ức, sự quan tâm, thay đổi giữa các thế hệ và khoảnh khắc nhỏ trong gia đình. Không bắt mọi tập có bố mẹ, việc nhà, bánh hoặc joke.',
      'tone', 'Hài hoặc cảm động, tùy ý tưởng người dùng. Tập hài giữ nhịp đối đáp và tương phản vui vẻ; tập cinematic cảm động đi từ một hành động/chi tiết cụ thể tới cảm xúc có nguyên nhân. Không cố chơi chữ, giảng đạo, bóp cảm xúc hoặc bắt mọi tập là con chăm bố mẹ.',
      'series', case when base->'series' @> '["Gia đình và ký ức"]'::jsonb then base->'series' else (base->'series') || '["Gia đình và ký ức"]'::jsonb end
    );
    if exists(select 1 from public.channel_profiles where project_id = target.id and workspace_version = target.workspace_version and version = 11) then
      if (select profile from public.channel_profiles where project_id = target.id and workspace_version = target.workspace_version and version = 11) <> next_profile then
        raise exception 'FAMILY_CHANNEL_PROFILE_V11_MISMATCH';
      end if;
    else
      insert into public.channel_profiles(project_id, workspace_version, version, profile)
      values(target.id, target.workspace_version, 11, next_profile);
    end if;
  end loop;
end $$;
