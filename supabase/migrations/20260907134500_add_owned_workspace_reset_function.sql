-- Database side of reset: it deliberately accepts only the project owner and
-- preserves project identity, members, brand settings, wallets and ledgers.
create or replace function private.reset_owned_project_workspace(
  _project_id uuid,
  _owner_user_id uuid,
  _backup_id uuid
) returns integer
language plpgsql security definer set search_path = public, private as $$
declare _next_version integer;
begin
  if not exists (select 1 from public.projects where id = _project_id and user_id = _owner_user_id) then
    raise exception 'Only the project owner can reset this workspace';
  end if;
  if exists (select 1 from public.generation_jobs where project_id = _project_id and status in ('queued', 'running')) then
    raise exception 'A generation job is still active';
  end if;
  if not exists (select 1 from private.workspace_reset_backups where id = _backup_id and project_id = _project_id and owner_user_id = _owner_user_id and status = 'verified' and expires_at > now()) then
    raise exception 'A verified backup is required';
  end if;

  delete from public.workspace_drafts where project_id = _project_id;
  delete from public.content_sets where project_id = _project_id;
  delete from public.generation_jobs where project_id = _project_id;
  delete from public.meme_collections where project_id = _project_id;
  delete from public.text_presets where project_id = _project_id and not is_system;
  delete from public.memes where project_id = _project_id;
  delete from public.assets where project_id = _project_id;
  delete from public.characters where project_id = _project_id;

  update public.projects
  set workspace_version = workspace_version + 1, workspace_reset_at = now(), updated_at = now()
  where id = _project_id
  returning workspace_version into _next_version;
  update private.workspace_reset_backups set status = 'executed', executed_at = now() where id = _backup_id;
  return _next_version;
end;
$$;

revoke all on function private.reset_owned_project_workspace(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.reset_owned_project_workspace(uuid, uuid, uuid) to service_role;
