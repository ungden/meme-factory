-- One row per production run holds the AI director's resumable pipeline state.
-- Each advance call runs exactly ONE script stage; a failed/stuck stage parks
-- the run and the next resume continues from the persisted state, never from
-- scratch. Stages: premises -> selection -> draft -> review -> shots -> done.
create table public.short_film_script_runs (
  run_id uuid primary key references public.short_film_production_runs(id) on delete cascade,
  stage text not null check (stage in ('premises','selection','draft','review','shots','done')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  state jsonb not null default '{}',
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.short_film_script_runs enable row level security;
revoke all on public.short_film_script_runs from public, anon, authenticated;
grant all on public.short_film_script_runs to service_role;