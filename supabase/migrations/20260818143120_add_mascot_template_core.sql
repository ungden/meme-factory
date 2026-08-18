-- Mascot Meme Engine core.
--
-- Base images are pre-generated mascot artwork with no text baked in. Users compose
-- memes on top of them client-side, so a new meme costs zero provider calls.
--
-- Deliberately independent from the continuity core (assets/asset_versions/
-- reference_images/identity_cards): those rows are immutable once their version is
-- locked, and safe zones are edited repeatedly.

-- ============================================
-- Taxonomy
-- ============================================

create table if not exists public.expression_tags (
  slug text primary key,
  label_vi text not null,
  vibe_group text not null
    check (vibe_group in ('positive', 'negative', 'neutral', 'intense', 'playful')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.layout_presets (
  id text primary key,
  label_vi text not null,
  description text,
  default_safe_zones jsonb not null default '{}'::jsonb,
  default_text_style jsonb not null default '{}'::jsonb,
  recommended_chars integer not null default 60 check (recommended_chars > 0),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Base images
-- ============================================

create table if not exists public.mascot_base_images (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  legacy_pose_id uuid unique references public.character_poses(id) on delete set null,

  expression_slug text not null default 'neutral'
    references public.expression_tags(slug) on delete restrict,
  expression_label text,
  layout_preset_id text not null references public.layout_presets(id) on delete restrict,
  variant_index integer not null default 0 check (variant_index >= 0),

  image_url text not null,
  storage_bucket text not null default 'base-images',
  storage_path text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  aspect_ratio text not null default '1:1'
    check (aspect_ratio in ('1:1', '9:16', '16:9', '4:5')),
  has_transparent_bg boolean not null default false,

  -- All rects are normalized 0..1 so they stay valid at preview scale and at export scale.
  safe_zones jsonb not null default '{}'::jsonb,
  safe_zones_source text not null default 'layout_default'
    check (safe_zones_source in ('layout_default', 'authored', 'detected')),
  safe_zones_updated_at timestamptz,
  default_text_style jsonb not null default '{}'::jsonb,
  recommended_chars integer not null default 60 check (recommended_chars > 0),
  watermark_area jsonb not null default '{}'::jsonb,

  status text not null default 'draft'
    check (status in ('draft', 'ready', 'archived')),
  sort_order integer not null default 100,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (character_id, expression_slug, layout_preset_id, aspect_ratio, variant_index)
);

-- ============================================
-- Character DNA (mutable, unlike identity_cards)
-- ============================================

create table if not exists public.character_dna (
  character_id uuid primary key references public.characters(id) on delete cascade,
  summary text not null default '',
  palette jsonb not null default '[]'::jsonb,
  face_traits jsonb not null default '[]'::jsonb,
  body_traits jsonb not null default '[]'::jsonb,
  tone jsonb not null default '{}'::jsonb,
  background_style jsonb not null default '{}'::jsonb,
  watermark_safe_area jsonb not null default '{}'::jsonb,
  must_preserve jsonb not null default '[]'::jsonb,
  may_change jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- Library
-- ============================================

create table if not exists public.meme_collections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meme_collection_items (
  collection_id uuid not null references public.meme_collections(id) on delete cascade,
  meme_id uuid not null references public.memes(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, meme_id)
);

create table if not exists public.text_presets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  style jsonb not null,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((is_system and project_id is null) or (not is_system and project_id is not null))
);

-- ============================================
-- Meme editor document
-- ============================================

alter table public.memes
  add column if not exists editor_doc jsonb,
  add column if not exists base_image_id uuid references public.mascot_base_images(id) on delete set null,
  add column if not exists composed_locally boolean not null default false;

comment on column public.memes.editor_doc is
  'MemeDoc v1: the client-side text-overlay document. Supersedes the never-populated canvas_data column.';

-- ============================================
-- Indexes
-- ============================================

create index if not exists idx_mbi_character_status
  on public.mascot_base_images(character_id, status, sort_order);
create index if not exists idx_mbi_expression
  on public.mascot_base_images(expression_slug) where status = 'ready';
create index if not exists idx_mbi_layout
  on public.mascot_base_images(layout_preset_id) where status = 'ready';
create index if not exists idx_mbi_legacy_pose
  on public.mascot_base_images(legacy_pose_id) where legacy_pose_id is not null;
create index if not exists idx_memes_base_image
  on public.memes(base_image_id) where base_image_id is not null;
create index if not exists idx_memes_editable
  on public.memes(project_id, created_at desc) where editor_doc is not null;
create index if not exists idx_meme_collections_project
  on public.meme_collections(project_id, sort_order);
create index if not exists idx_meme_collection_items_meme
  on public.meme_collection_items(meme_id);
create index if not exists idx_text_presets_project
  on public.text_presets(project_id) where project_id is not null;

-- ============================================
-- updated_at triggers (update_updated_at() ships in the initial schema)
-- ============================================

drop trigger if exists layout_presets_updated_at on public.layout_presets;
create trigger layout_presets_updated_at before update on public.layout_presets
  for each row execute function update_updated_at();

drop trigger if exists mascot_base_images_updated_at on public.mascot_base_images;
create trigger mascot_base_images_updated_at before update on public.mascot_base_images
  for each row execute function update_updated_at();

drop trigger if exists character_dna_updated_at on public.character_dna;
create trigger character_dna_updated_at before update on public.character_dna
  for each row execute function update_updated_at();

drop trigger if exists meme_collections_updated_at on public.meme_collections;
create trigger meme_collections_updated_at before update on public.meme_collections
  for each row execute function update_updated_at();

-- ============================================
-- RLS
-- ============================================

alter table public.expression_tags enable row level security;
alter table public.layout_presets enable row level security;
alter table public.mascot_base_images enable row level security;
alter table public.character_dna enable row level security;
alter table public.meme_collections enable row level security;
alter table public.meme_collection_items enable row level security;
alter table public.text_presets enable row level security;

revoke all on public.expression_tags, public.layout_presets, public.mascot_base_images,
  public.character_dna, public.meme_collections, public.meme_collection_items,
  public.text_presets from public, anon;

grant select on public.expression_tags, public.layout_presets to authenticated;
grant select, insert, update, delete on public.mascot_base_images to authenticated;
grant select, insert, update, delete on public.character_dna to authenticated;
grant select, insert, update, delete on public.meme_collections to authenticated;
grant select, insert, update, delete on public.meme_collection_items to authenticated;
grant select, insert, update, delete on public.text_presets to authenticated;

grant all on public.expression_tags, public.layout_presets, public.mascot_base_images,
  public.character_dna, public.meme_collections, public.meme_collection_items,
  public.text_presets to service_role;

-- Taxonomy is shared reference data; only service_role writes it.
create policy "Signed in users can read expression tags"
  on public.expression_tags for select to authenticated using (true);

create policy "Signed in users can read layout presets"
  on public.layout_presets for select to authenticated using (true);

create policy "Project collaborators can manage base images"
  on public.mascot_base_images for all to authenticated
  using (
    character_id in (
      select c.id from public.characters c
      where c.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    character_id in (
      select c.id from public.characters c
      where c.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can manage character dna"
  on public.character_dna for all to authenticated
  using (
    character_id in (
      select c.id from public.characters c
      where c.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    character_id in (
      select c.id from public.characters c
      where c.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Project collaborators can manage collections"
  on public.meme_collections for all to authenticated
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

create policy "Project collaborators can manage collection items"
  on public.meme_collection_items for all to authenticated
  using (
    collection_id in (
      select mc.id from public.meme_collections mc
      where mc.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  )
  with check (
    collection_id in (
      select mc.id from public.meme_collections mc
      where mc.project_id in (
        select id from public.projects where user_id = (select auth.uid())
        union
        select project_id from public.project_members where user_id = (select auth.uid())
      )
    )
  );

create policy "Users can read system and project text presets"
  on public.text_presets for select to authenticated
  using (
    is_system
    or project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can write text presets"
  on public.text_presets for insert to authenticated
  with check (
    not is_system
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can update text presets"
  on public.text_presets for update to authenticated
  using (
    not is_system
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  )
  with check (
    not is_system
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

create policy "Project collaborators can delete text presets"
  on public.text_presets for delete to authenticated
  using (
    not is_system
    and project_id in (
      select id from public.projects where user_id = (select auth.uid())
      union
      select project_id from public.project_members where user_id = (select auth.uid())
    )
  );

-- ============================================
-- Storage bucket for generated base images
-- ============================================

insert into storage.buckets (id, name, public)
values ('base-images', 'base-images', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload base images" on storage.objects;
create policy "Authenticated users can upload base images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'base-images');

drop policy if exists "Base images are publicly readable" on storage.objects;
create policy "Base images are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'base-images');

drop policy if exists "Owners can delete their base images" on storage.objects;
create policy "Owners can delete their base images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'base-images' and (select auth.uid())::text = (storage.foldername(name))[1]);
