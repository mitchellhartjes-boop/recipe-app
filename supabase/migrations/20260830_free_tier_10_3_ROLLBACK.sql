-- Revert the free tier to 20/5. Run this if the first reviews after v2 complain
-- about "only 10 free" and the call is to back it out.
--
-- Reverting the DB alone leaves the app TELLING users 10 while ALLOWING 20 —
-- generous and harmless, but incomplete. To fully revert, also set
-- PLANS.free back to { imports: 20, video: 5 } in
-- netlify/functions/_lib/usage.mjs, plus the landing page and press kit, and
-- deploy. The App Store description would need a version submission, which is
-- why a revert should normally stop at the DB unless it is going to be permanent.

CREATE OR REPLACE FUNCTION public.plan_limits(p_plan text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when p_plan = 'pro'
    then jsonb_build_object('imports', 200, 'video', 40)
    else jsonb_build_object('imports', 20,  'video', 5)
  end
$function$;
