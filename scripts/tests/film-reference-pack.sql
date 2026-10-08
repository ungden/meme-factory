-- Caller wraps BEGIN / ROLLBACK. Khoá bộ ảnh chuẩn phim: tạo asset khi nhân vật
-- chưa có, khoá đúng ba vai trò, gọi lại không đẻ phiên bản, thiếu mặt thì từ chối.
DO $$
declare p projects; cid uuid:=gen_random_uuid(); first jsonb; again jsonb; refs integer; status_value text; rejected boolean:=false;
  pack jsonb:='[{"role":"identity_face","url":"https://x/face.png","hash":"f1"},{"role":"identity_body","url":"https://x/body.png","hash":"b1"},{"role":"look","url":"https://x/back.png","hash":"k1"}]';
begin
  select * into p from projects order by created_at limit 1;
  insert into characters(id,project_id,name,description) values(cid,p.id,'Bé QA','Bé trai 2 tuổi');
  first:=lock_film_reference_pack(p.id,p.user_id,p.workspace_version,cid,pack,'human','Bé trai 2 tuổi');
  again:=lock_film_reference_pack(p.id,p.user_id,p.workspace_version,cid,pack,'human','Bé trai 2 tuổi');
  if (again->>'assetVersionId')<>(first->>'assetVersionId') or (again->>'reused')<>'true' then raise exception 'Same pack created a second version'; end if;
  select av.status into status_value from asset_versions av where av.id=(first->>'assetVersionId')::uuid;
  if status_value<>'locked' then raise exception 'Pack version is not locked'; end if;
  select count(*) into refs from reference_images where asset_version_id=(first->>'assetVersionId')::uuid;
  if refs<>3 then raise exception 'Expected three reference images, got %', refs; end if;
  if not exists(select 1 from reference_images where asset_version_id=(first->>'assetVersionId')::uuid and role='identity_face' and is_primary)
    then raise exception 'Face is not the primary reference'; end if;
  if (select continuity_asset_id from characters where id=cid) is null then raise exception 'Character not linked to its asset'; end if;
  begin
    perform lock_film_reference_pack(p.id,p.user_id,p.workspace_version,cid,
      '[{"role":"identity_body","url":"https://x/body.png","hash":"b2"}]'::jsonb,'human','');
  exception when others then rejected:=position('FILM_PACK_INCOMPLETE' in sqlerrm)>0; end;
  if not rejected then raise exception 'Pack without a face was accepted'; end if;
  if has_function_privilege('authenticated','lock_film_reference_pack(uuid,uuid,integer,uuid,jsonb,text,text)','EXECUTE')
    then raise exception 'Client can lock reference packs directly'; end if;
end $$;
