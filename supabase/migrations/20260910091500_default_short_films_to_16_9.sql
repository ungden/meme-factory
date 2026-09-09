-- AIDA's reusable master is landscape. Channel-specific crops can be derived
-- later, while a portrait-only master cannot recover the missing composition.
alter table public.video_plans alter column format set default '16:9';

alter table public.short_film_automation_settings
  alter column default_config set default
  '{"duration":35,"format":"16:9","resolution":"720p","audioMode":"native","subtitles":true}'::jsonb;
