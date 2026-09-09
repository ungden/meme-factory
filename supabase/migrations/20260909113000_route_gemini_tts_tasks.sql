-- Gemini TTS runs directly on the Railway worker. Keep generation job
-- provenance accurate even though the generic quote RPC historically marked
-- every non-image short-film task as WaveSpeed.
create or replace function public.route_short_film_generation_provider()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workflow_version = 'short-film-v2'
     and new.model in (
       'gemini-3.1-flash-tts-preview',
       'gemini-2.5-pro-preview-tts',
       'gemini-2.5-flash-preview-tts'
     ) then
    new.provider := 'google';
  end if;
  return new;
end;
$$;

drop trigger if exists route_short_film_generation_provider
  on public.generation_jobs;
create trigger route_short_film_generation_provider
before insert or update of model, workflow_version, provider
on public.generation_jobs
for each row execute function public.route_short_film_generation_provider();

revoke all on function public.route_short_film_generation_provider()
from public, anon, authenticated;
