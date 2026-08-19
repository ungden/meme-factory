-- The watermark picker is a 3x3 grid, so the four edge midpoints become valid
-- positions alongside the corners and the centre.

alter table public.projects
  drop constraint if exists projects_watermark_position_check;

alter table public.projects
  add constraint projects_watermark_position_check
  check (watermark_position in (
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ));
