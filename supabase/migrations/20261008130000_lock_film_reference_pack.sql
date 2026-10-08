-- Khoá bộ ảnh chuẩn phim (cận mặt, toàn thân, sau lưng) cho một nhân vật trong
-- một giao dịch. Trước đây chỉ script chạy tay tạo được phiên bản này, nên
-- nhân vật khách tạo trong app không bao giờ lên phim được. Gọi lại cùng bộ ảnh
-- trả về đúng phiên bản cũ thay vì đẻ thêm.
create or replace function public.lock_film_reference_pack(
  p_project uuid,
  p_actor uuid,
  p_workspace integer,
  p_character uuid,
  p_images jsonb,
  p_profile_type text,
  p_summary text
) returns jsonb language plpgsql set search_path=public as $$
declare
  c characters;
  asset_id_value uuid;
  next_version integer;
  version_id uuid;
  img jsonb;
  pack_hash text;
begin
  perform film_assert_access(p_project,p_actor,p_workspace);
  if p_profile_type not in ('human','mascot') then raise exception 'FILM_PACK_INVALID'; end if;
  if jsonb_typeof(p_images)<>'array'
     or not exists(select 1 from jsonb_array_elements(p_images) e where e->>'role'='identity_face')
     or not exists(select 1 from jsonb_array_elements(p_images) e where e->>'role'='identity_body')
     or exists(select 1 from jsonb_array_elements(p_images) e
       where e->>'role' not in ('identity_face','identity_body','look')
          or coalesce(e->>'url','')='' or coalesce(e->>'hash','')='')
  then raise exception 'FILM_PACK_INCOMPLETE'; end if;

  select * into c from characters where id=p_character and project_id=p_project for update;
  if not found then raise exception 'CHARACTER_NOT_FOUND'; end if;

  asset_id_value:=c.continuity_asset_id;
  if asset_id_value is null then
    insert into assets(project_id,legacy_character_id,kind,name,created_by)
      values(p_project,c.id,'character',c.name,p_actor)
      on conflict(legacy_character_id) do update set name=excluded.name,updated_at=now()
      returning id into asset_id_value;
    update characters set continuity_asset_id=asset_id_value where id=c.id;
  end if;

  pack_hash:='film-pack:'||md5((select string_agg((e->>'role')||':'||(e->>'hash'),',' order by e->>'role') from jsonb_array_elements(p_images) e));
  select id,version into version_id,next_version from asset_versions where asset_id=asset_id_value and content_hash=pack_hash;
  if version_id is not null then
    return jsonb_build_object('assetVersionId',version_id,'version',next_version,'reused',true);
  end if;

  select coalesce(max(version),0)+1 into next_version from asset_versions where asset_id=asset_id_value;
  -- Phiên bản đã khoá không nhận thêm ảnh con (trigger), nên dựng ở nháp rồi khoá.
  insert into asset_versions(asset_id,version,status,identity_profile_type,notes,content_hash,created_by)
    values(asset_id_value,next_version,'draft',p_profile_type,'Bộ ảnh chuẩn phim do AI tạo ở khâu thiết lập kênh.',pack_hash,p_actor)
    returning id into version_id;
  for img in select * from jsonb_array_elements(p_images) loop
    insert into reference_images(asset_version_id,role,subject_id,image_url,source_hash,source_type,mime_type,width,height,quality_report,is_primary,reproducible,priority)
    values(version_id,img->>'role',c.id::text,img->>'url',img->>'hash','generated','image/png',
      nullif(img->>'width','')::integer,nullif(img->>'height','')::integer,
      jsonb_build_object('source','film_setup','humanApproved',false),
      img->>'role'='identity_face',true,
      case img->>'role' when 'identity_face' then 100 when 'identity_body' then 90 else 80 end);
  end loop;
  insert into identity_cards(asset_version_id,summary,coverage)
    values(version_id,coalesce(p_summary,''),jsonb_build_object(
      'faceCloseUp',true,'fullBody',true,
      'backView',exists(select 1 from jsonb_array_elements(p_images) e where e->>'role'='look')));
  update asset_versions set status='locked',locked_at=now() where id=version_id;
  return jsonb_build_object('assetVersionId',version_id,'version',next_version,'reused',false);
end $$;
revoke all on function public.lock_film_reference_pack(uuid,uuid,integer,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.lock_film_reference_pack(uuid,uuid,integer,uuid,jsonb,text,text) to service_role;
