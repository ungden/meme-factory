alter table public.video_plans
  add column if not exists archived_at timestamptz;

create index if not exists video_plans_active_picker
  on public.video_plans(project_id, workspace_version, updated_at desc)
  where archived_at is null and status <> 'cancelled';
