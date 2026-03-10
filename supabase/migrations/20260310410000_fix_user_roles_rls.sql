-- Fix RLS recursion on user_roles by using SECURITY DEFINER helper

create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $func$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _uid
      and ur.role = 'admin'
  );
$func$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists "Users can view their own role" on public.user_roles;
drop policy if exists "Admins can manage all roles" on public.user_roles;

create policy "Users/Admins can view roles"
  on public.user_roles
  for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "Admins can insert roles"
  on public.user_roles
  for insert
  with check (public.is_admin(auth.uid()));

create policy "Admins can update roles"
  on public.user_roles
  for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Admins can delete roles"
  on public.user_roles
  for delete
  using (public.is_admin(auth.uid()));
