-- The house art direction a mascot was built in. Stored so a later batch matches
-- the first one instead of drifting to whatever the default happens to be.
alter table public.character_dna
  add column if not exists art_direction text not null default 'soft_3d'
    check (art_direction in ('soft_3d', 'glossy_3d', 'clay_3d', 'minimal_3d'));

comment on column public.character_dna.art_direction is
  'Render style id from src/lib/mascot-art-direction.ts.';
