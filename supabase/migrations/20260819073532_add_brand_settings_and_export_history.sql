-- Brand settings and export history.
--
-- Exports happen in the browser (canvas -> toDataURL -> download), so the file
-- itself never reaches the server. This table records what was exported and at
-- what size, which is what the Library's export history shows.

alter table public.projects
  add column if not exists creator_handle text;

comment on column public.projects.creator_handle is
  'Public handle used as the default text watermark, e.g. @toilanguoisaigon.';

create table if not exists public.meme_exports (
  id uuid primary key default gen_random_uuid(),
  meme_id uuid references public.memes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  base_image_id uuid references public.mascot_base_images(id) on delete set null,
  format text not null default 'png' check (format in ('png', 'jpg', 'webp')),
  aspect_ratio text not null default '1:1'
    check (aspect_ratio in ('1:1', '9:16', '16:9', '4:5')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  had_watermark boolean not null default false,
  exported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meme_exports_meme on public.meme_exports(meme_id, created_at desc);
create index if not exists idx_meme_exports_project on public.meme_exports(project_id, created_at desc);

alter table public.meme_exports enable row level security;
revoke all on public.meme_exports from public, anon;
grant select, insert on public.meme_exports to authenticated;
grant all on public.meme_exports to service_role;

create policy "Project collaborators can view exports"
  on public.meme_exports for select to authenticated
  using (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can record exports"
  on public.meme_exports for insert to authenticated
  with check (
    exported_by = (select auth.uid())
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );
