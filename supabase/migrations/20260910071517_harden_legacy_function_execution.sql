-- Trigger helpers and server-only summaries must not be callable anonymously.
revoke execute on function public.get_project_card_summaries() from public,anon;
revoke execute on function public.is_admin(uuid) from public,anon;
revoke execute on function public.handle_new_user_wallet() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;

alter function public.generate_project_slug() set search_path=public;
alter function public.update_updated_at() set search_path=public;
