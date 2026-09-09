-- A designed voice is an original synthetic identity.  It is created before
-- its activation TTS task, so the permanent voice ID is never guessed from an
-- adult system voice or an arbitrary pitch adjustment.
alter table public.short_film_tasks
  drop constraint if exists short_film_tasks_kind_check;

alter table public.short_film_tasks
  add constraint short_film_tasks_kind_check
  check (kind in ('image','voice_design','tts','video','lip_sync','transcribe','render','frame'));
