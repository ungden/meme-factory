-- Tạo bảng user_roles để quản lý quyền
create table if not exists public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  role text not null default 'user' check (role in ('user', 'admin', 'moderator')),
  created_at timestamptz default now() not null
);

-- RLS
alter table public.user_roles enable row level security;

-- Ai cũng có thể đọc role của mình
create policy "Users can view their own role"
  on public.user_roles for select
  using (auth.uid() = user_id);

-- Chỉ admin mới có thể thêm/sửa/xóa roles
create policy "Admins can manage all roles"
  on public.user_roles for all
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Index
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);

-- Gán admin cho tduong297@gmail.com
insert into public.user_roles (user_id, role)
values ('3d3a86e2-2161-42a0-92e7-4dedea03be22', 'admin');
