alter table public.video_plan_scenes
  add column if not exists performance_direction jsonb;

comment on column public.video_plan_scenes.performance_direction is
  'Versioned visual comedy direction for storyboard/performance v2. Legacy scenes may be null.';
