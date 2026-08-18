-- Character reference and background generations are billed provider calls, so
-- they must be able to persist a generation job like meme generation already does.

alter table public.generation_jobs
  drop constraint if exists generation_jobs_creation_kind_check;

alter table public.generation_jobs
  add constraint generation_jobs_creation_kind_check
  check (creation_kind in (
    'meme',
    'fashion_shot',
    'storyboard_shot',
    'character_reference',
    'background'
  ));
