-- Seedance 2.5 accepts an integer duration from 4 to 30 seconds. Storyboard
-- clips use the exact amount needed by their dialogue/action and preserve a
-- separate edit point for the final render.
alter table public.video_plan_scenes
  drop constraint if exists video_scene_storyboard_shape;

alter table public.video_plan_scenes
  add constraint video_scene_storyboard_shape check (
    storyboard is null or case
      when jsonb_typeof(storyboard) = 'object'
        and storyboard->>'version' = '1'
        and jsonb_typeof(storyboard->'durationSeconds') = 'number'
        and jsonb_typeof(storyboard->'beats') = 'array'
      then
        (storyboard->>'durationSeconds')::integer between 4 and 30
        and duration_seconds = (storyboard->>'durationSeconds')::integer
        and jsonb_array_length(storyboard->'beats') between 1 and 12
        and (
          not (storyboard ? 'contentEndSeconds')
          or (
            jsonb_typeof(storyboard->'contentEndSeconds') = 'number'
            and (storyboard->>'contentEndSeconds')::numeric > 0
            and (storyboard->>'contentEndSeconds')::numeric
              <= (storyboard->>'durationSeconds')::integer
          )
        )
      else false
    end
  );

comment on column public.video_plan_scenes.storyboard is
  'Versioned 4-30s planned beats. contentEndSeconds is the useful edit boundary; transcript remains subtitle evidence.';
