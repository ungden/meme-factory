alter table public.character_dna
  drop constraint if exists character_dna_art_direction_check;

alter table public.character_dna
  add constraint character_dna_art_direction_check
  check (art_direction in (
    'soft_3d',
    'glossy_3d',
    'clay_3d',
    'minimal_3d',
    'photoreal_human'
  ));

comment on column public.character_dna.art_direction is
  'Render style id from src/lib/mascot-art-direction.ts, including live-action photorealistic humans.';
