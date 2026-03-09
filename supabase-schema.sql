-- ============================================
-- Meme Factory - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- UUID generation uses built-in gen_random_uuid() (Postgres 14+)

-- ============================================
-- Projects (Fanpages)
-- ============================================
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  style_prompt text, -- AI style instructions for content generation
  watermark_url text,
  watermark_position text default 'bottom-right' check (watermark_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')),
  watermark_opacity real default 0.8,
  default_format text default '1:1' check (default_format in ('1:1', '9:16', '16:9', '4:5')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- Characters
-- ============================================
create table public.characters (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  personality text not null default '',
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- Character Poses (phôi nhân vật)
-- ============================================
create table public.character_poses (
  id uuid default gen_random_uuid() primary key,
  character_id uuid references public.characters(id) on delete cascade not null,
  name text not null,
  emotion text default 'neutral' check (emotion in (
    'happy', 'sad', 'angry', 'surprised', 'confused', 'cool',
    'love', 'scared', 'thinking', 'laughing', 'crying', 'neutral',
    'excited', 'tired', 'custom'
  )),
  image_url text not null,
  description text,
  is_transparent boolean default false,
  created_at timestamptz default now() not null
);

-- ============================================
-- Memes
-- ============================================
create table public.memes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text,
  original_idea text not null,
  generated_content jsonb not null default '{}',
  selected_characters jsonb not null default '[]',
  format text default '1:1' check (format in ('1:1', '9:16', '16:9', '4:5')),
  image_url text,
  canvas_data text, -- fabric.js JSON
  has_watermark boolean default false,
  status text default 'draft' check (status in ('draft', 'generating', 'completed', 'failed')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table public.projects enable row level security;
alter table public.characters enable row level security;
alter table public.character_poses enable row level security;
alter table public.memes enable row level security;

-- Projects: users can only access their own projects
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Characters: access through project ownership
create policy "Users can view characters of their projects"
  on public.characters for select
  using (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can create characters in their projects"
  on public.characters for insert
  with check (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can update characters in their projects"
  on public.characters for update
  using (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can delete characters in their projects"
  on public.characters for delete
  using (project_id in (select id from public.projects where user_id = auth.uid()));

-- Character Poses: access through character → project ownership
create policy "Users can view poses of their characters"
  on public.character_poses for select
  using (character_id in (
    select c.id from public.characters c
    join public.projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users can create poses for their characters"
  on public.character_poses for insert
  with check (character_id in (
    select c.id from public.characters c
    join public.projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users can delete poses of their characters"
  on public.character_poses for delete
  using (character_id in (
    select c.id from public.characters c
    join public.projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ));

-- Memes: access through project ownership
create policy "Users can view memes of their projects"
  on public.memes for select
  using (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can create memes in their projects"
  on public.memes for insert
  with check (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can update memes in their projects"
  on public.memes for update
  using (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "Users can delete memes in their projects"
  on public.memes for delete
  using (project_id in (select id from public.projects where user_id = auth.uid()));

-- ============================================
-- Performance Indexes
-- ============================================
create index idx_projects_user_id on public.projects(user_id);
create index idx_characters_project_id on public.characters(project_id);
create index idx_character_poses_character_id on public.character_poses(character_id);
create index idx_memes_project_id on public.memes(project_id);
create index idx_memes_created_at on public.memes(created_at desc);

-- ============================================
-- Updated_at trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function update_updated_at();

create trigger characters_updated_at
  before update on public.characters
  for each row execute function update_updated_at();

create trigger memes_updated_at
  before update on public.memes
  for each row execute function update_updated_at();

-- ============================================
-- Storage Buckets
-- ============================================
-- Run these separately or via Supabase Dashboard:
-- 1. Create bucket "character-poses" (public)
-- 2. Create bucket "watermarks" (public)
-- 3. Create bucket "memes" (public)
-- 4. Create bucket "avatars" (public)

insert into storage.buckets (id, name, public) values ('character-poses', 'character-poses', true);
insert into storage.buckets (id, name, public) values ('watermarks', 'watermarks', true);
insert into storage.buckets (id, name, public) values ('memes', 'memes', true);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Storage policies
create policy "Authenticated users can upload character poses"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('character-poses', 'watermarks', 'memes', 'avatars'));

create policy "Anyone can view public files"
  on storage.objects for select
  to public
  using (bucket_id in ('character-poses', 'watermarks', 'memes', 'avatars'));

create policy "Users can delete their own files"
  on storage.objects for delete
  to authenticated
  using (auth.uid()::text = (storage.foldername(name))[1]);
