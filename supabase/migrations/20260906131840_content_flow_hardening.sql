-- A ContentSet is a reproducible editorial brief.  These fields deliberately
-- snapshot the approved cast/brand at the time work starts, rather than making
-- old work silently change when a character is edited later.
alter table public.content_sets
  add column if not exists title text,
  add column if not exists brief_version integer not null default 1,
  add column if not exists cast_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.content_outputs
  add column if not exists meme_id uuid references public.memes(id) on delete set null,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists quote_snapshot jsonb,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

-- A failed provider attempt must not permanently block a deliberate retry.
-- content_outputs.generation_job_id remains the latest attempt for compatibility.
drop index if exists public.idx_generation_jobs_one_content_output;
create index if not exists idx_generation_jobs_content_output_created
  on public.generation_jobs(content_output_id, created_at desc)
  where content_output_id is not null;
create index if not exists idx_content_outputs_meme_id
  on public.content_outputs(meme_id)
  where meme_id is not null;

-- The old migration enabled RLS but projects created before it may still have
-- broad default grants. Keep browser access limited to signed-in collaborators.
revoke all on table public.content_sets, public.content_outputs, public.content_output_reviews from anon;
grant select, insert, update on table public.content_sets, public.content_outputs, public.content_output_reviews to authenticated;
