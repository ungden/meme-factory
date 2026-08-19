-- Meme templates become project-owned artwork; a mascot is now an optional label.
--
-- Why: the template library could only hold artwork belonging to a `characters`
-- row, so the only cheap way to get templates was to mirror every AI reference
-- pose into it. That mirror fabricated facts — hardcoded layout and aspect ratio,
-- never measured the image, copied a 1:1 caption zone onto artwork of any shape.
-- All 135 rows in production came from it, none was ever usable, and no meme ever
-- referenced one.
--
-- After this migration a template must be measured, framed and have a confirmed
-- caption area before it can be `ready`, and that is enforced here rather than by
-- convention in the client.
--
-- Verify (all must return 0 except the archived count):
--   select count(*) from mascot_base_images where status='ready' and (width is null or height is null);
--   select count(*) from mascot_base_images where project_id is null;
--   select count(*) from mascot_base_images t join characters c on c.id = t.character_id
--     where c.project_id <> t.project_id;
--   select status, count(*) from mascot_base_images group by 1;

-- ============================================
-- Ownership: project owns the template, mascot is a label
-- ============================================

alter table public.mascot_base_images
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

update public.mascot_base_images t
set project_id = c.project_id
from public.characters c
where c.id = t.character_id and t.project_id is null;

alter table public.mascot_base_images
  alter column project_id set not null,
  alter column character_id drop not null,
  alter column layout_preset_id drop not null;

-- Deleting a mascot must not destroy the user's templates; it only unlabels them.
alter table public.mascot_base_images
  drop constraint mascot_base_images_character_id_fkey,
  add constraint mascot_base_images_character_id_fkey
    foreign key (character_id) references public.characters(id) on delete set null;

-- ============================================
-- Provenance and the facts the mirror never recorded
-- ============================================

alter table public.mascot_base_images
  add column if not exists source text not null default 'upload'
    check (source in ('upload', 'ai_base_pack', 'imported_pose')),
  -- Provenance only, deliberately not unique: importing one pose at two different
  -- crops is legitimate.
  add column if not exists source_pose_id uuid references public.character_poses(id) on delete set null,
  add column if not exists content_hash text,
  -- How the artwork sits inside the canvas. render.ts already consumes
  -- fit/offset/scale; there was simply nowhere to persist the user's choice.
  add column if not exists frame jsonb not null
    default '{"fit":"cover","offset":{"x":0,"y":0},"scale":1}'::jsonb,
  add column if not exists source_width integer check (source_width is null or source_width > 0),
  add column if not exists source_height integer check (source_height is null or source_height > 0),
  add column if not exists title text;

update public.mascot_base_images
set source_pose_id = legacy_pose_id,
    source = case when legacy_pose_id is not null then 'imported_pose'
                  when generation_job_id is not null then 'ai_base_pack'
                  else 'upload' end
where source_pose_id is null;

-- ============================================
-- Drop what only existed to satisfy the old unique key
-- ============================================

-- variant_index is written by both insert paths and read by none; the unique key
-- it served is unenforceable once character_id is nullable (NULLs compare distinct)
-- and encodes no rule a user cares about — two different "cười lớn" images are fine.
-- Removing it also removes the non-atomic pre-count both writers had to do.
alter table public.mascot_base_images
  drop constraint if exists mascot_base_images_character_id_expression_slug_layout_pres_key;

alter table public.mascot_base_images
  drop column if exists variant_index,
  -- legacy_pose_id's unique + on-delete-set-null pair is what let a deleted pose
  -- orphan a row and a re-sync duplicate it. source_pose_id replaces it without
  -- the unique.
  drop column if exists legacy_pose_id,
  -- safe_zones.watermark already carries this.
  drop column if exists watermark_area;

-- ============================================
-- Indexes
-- ============================================

create unique index if not exists idx_templates_project_hash
  on public.mascot_base_images(project_id, content_hash) where content_hash is not null;
create index if not exists idx_templates_project_status
  on public.mascot_base_images(project_id, status, sort_order, created_at);
create index if not exists idx_templates_character
  on public.mascot_base_images(character_id) where character_id is not null;

drop index if exists idx_mbi_legacy_pose;
create index if not exists idx_templates_source_pose
  on public.mascot_base_images(source_pose_id) where source_pose_id is not null;

-- ============================================
-- `ready` means a human confirmed where the caption lands
-- ============================================

alter table public.mascot_base_images
  drop constraint if exists templates_ready_is_complete;

alter table public.mascot_base_images
  add constraint templates_ready_is_complete check (
    status <> 'ready' or (
      width is not null
      and height is not null
      and jsonb_typeof(safe_zones -> 'zones') = 'object'
      and safe_zones -> 'zones' <> '{}'::jsonb
      and frame is not null
    )
  );

-- ============================================
-- A mascot label, if present, must belong to the owning project.
-- Cross-table invariants cannot live in a CHECK.
-- ============================================

create or replace function private.assert_template_character_in_project()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.character_id is not null then
    if not exists (
      select 1 from public.characters c
      where c.id = new.character_id and c.project_id = new.project_id
    ) then
      raise exception 'Mascot does not belong to this project';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.assert_template_character_in_project() from public, anon, authenticated;

drop trigger if exists assert_template_character_in_project on public.mascot_base_images;
create trigger assert_template_character_in_project
  before insert or update of character_id, project_id on public.mascot_base_images
  for each row execute function private.assert_template_character_in_project();

-- ============================================
-- RLS: one hop through projects instead of two through characters
-- ============================================

drop policy if exists "Project collaborators can manage base images" on public.mascot_base_images;

create policy "Project collaborators can manage meme templates"
  on public.mascot_base_images for all to authenticated
  using (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  )
  with check (
    project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

-- ============================================
-- Storage for manually uploaded templates
-- ============================================

insert into storage.buckets (id, name, public)
values ('meme-templates', 'meme-templates', true)
on conflict (id) do nothing;

drop policy if exists "Project collaborators can write meme template files" on storage.objects;
create policy "Project collaborators can write meme template files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meme-templates'
    and (storage.foldername(name))[1] in (
      select id::text from public.projects where user_id = (select auth.uid())
      union
      select project_id::text from public.project_members where user_id = (select auth.uid())
    )
  );

drop policy if exists "Meme template files are publicly readable" on storage.objects;
create policy "Meme template files are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'meme-templates');

drop policy if exists "Project collaborators can delete meme template files" on storage.objects;
create policy "Project collaborators can delete meme template files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meme-templates'
    and (storage.foldername(name))[1] in (
      select id::text from public.projects where user_id = (select auth.uid())
      union
      select project_id::text from public.project_members where user_id = (select auth.uid())
    )
  );

-- ============================================
-- Hide the machine-fabricated rows. Archived, not deleted; the original poses
-- are untouched in character_poses.
-- ============================================

update public.mascot_base_images t
set status = 'archived'
where t.source = 'imported_pose'
  and t.status = 'draft'
  and t.width is null
  and not exists (select 1 from public.memes m where m.base_image_id = t.id)
  and not exists (select 1 from public.meme_exports e where e.base_image_id = t.id);
