-- Free tier 20/5 -> 10/3. Owner ruling 2026-08-27, applied 2026-08-30 with the
-- v2 (1.1) App Store release.
--
-- This is the ENFORCEMENT half. Its twin is PLANS in
-- netlify/functions/_lib/usage.mjs, which mirrors these numbers for the
-- messages the user reads. They must never disagree: plan_limits() decides what
-- happens, PLANS decides what the user is told it will do.
--
-- Captured verbatim from pg_get_functiondef before editing, so the signature,
-- volatility, and search_path are byte-identical to what was running. Only the
-- two free-tier numbers changed.

CREATE OR REPLACE FUNCTION public.plan_limits(p_plan text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when p_plan = 'pro'
    then jsonb_build_object('imports', 200, 'video', 40)
    else jsonb_build_object('imports', 10,  'video', 3)
  end
$function$;

-- Verify:
--   select plan_limits('free') as free, plan_limits('pro') as pro;
--   -> free {"video": 3, "imports": 10} | pro {"video": 40, "imports": 200}
