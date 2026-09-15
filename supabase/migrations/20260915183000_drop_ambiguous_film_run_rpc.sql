-- Keep one canonical production-run RPC signature. The guest-aware overload
-- supersedes the legacy 12-argument version; retaining both makes PostgREST
-- reject calls as ambiguous when the optional guest payload is present.
drop function if exists public.create_film_production_run_v2(uuid,uuid,integer,uuid,integer,text,integer,integer,uuid,text,date,text);
select pg_notify('pgrst','reload schema');
