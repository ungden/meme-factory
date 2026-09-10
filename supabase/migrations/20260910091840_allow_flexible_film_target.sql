-- Target duration guides the writer. Final runtime is derived from completed
-- dialogue/action and may differ; do not constrain it to preset multiples.
alter table public.video_plans
  drop constraint if exists video_plans_target_duration_seconds_check;
alter table public.video_plans
  add constraint video_plans_target_duration_seconds_check
  check (target_duration_seconds between 15 and 120);
