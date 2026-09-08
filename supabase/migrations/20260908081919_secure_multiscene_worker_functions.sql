-- These are internal queue-claim RPCs. Service role is the only caller; an
-- authenticated browser must never be able to lease or complete another
-- project's provider/render job.
revoke all on function public.claim_wavespeed_video_jobs(integer, integer) from anon, authenticated;
revoke all on function public.claim_video_plan_render_jobs(integer, integer) from anon, authenticated;
grant execute on function public.claim_wavespeed_video_jobs(integer, integer) to service_role;
grant execute on function public.claim_video_plan_render_jobs(integer, integer) to service_role;
