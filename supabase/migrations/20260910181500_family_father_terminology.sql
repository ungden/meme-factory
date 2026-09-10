-- Publish a new immutable family profile revision with the canonical father term.
-- Existing plans and media keep their original profile reference.
with latest as (
  select distinct on (project_id, workspace_version)
    project_id,
    workspace_version,
    version,
    profile
  from public.channel_profiles
  order by project_id, workspace_version, version desc
), canonical as (
  select
    project_id,
    workspace_version,
    version + 1 as next_version,
    jsonb_set(
      jsonb_set(profile, '{version}', to_jsonb(version + 1), true),
      '{writingPolicyVersion}',
      to_jsonb('family-dialogue-10'::text),
      true
    ) as next_profile
  from latest
  where jsonb_path_exists(profile, '$.roles[*] ? (@.name == "Bố")')
    and coalesce(profile ->> 'writingPolicyVersion', '') <> 'family-dialogue-10'
)
insert into public.channel_profiles (
  project_id,
  workspace_version,
  version,
  profile
)
select project_id, workspace_version, next_version, next_profile
from canonical
on conflict (project_id, workspace_version, version) do nothing;
