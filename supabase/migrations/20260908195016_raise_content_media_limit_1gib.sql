-- AIDA keeps generated project media private. One GiB is the application
-- ceiling for a single MP4; the project-level Storage limit must be at least
-- this high as well.
update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 1073741824)
where id = 'content-media';

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'content-media'
      and public = false
      and file_size_limit >= 1073741824
  ) then
    raise exception 'content-media must remain private with a 1 GiB file limit';
  end if;
end
$$;
