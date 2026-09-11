alter table public.creative_assists
  drop constraint if exists creative_assists_kind_check;

alter table public.creative_assists
  add constraint creative_assists_kind_check
  check (kind in ('idea_suggestions', 'image_plan', 'video_clip_plan', 'video_plan', 'scene_revision', 'performance_revision'));
