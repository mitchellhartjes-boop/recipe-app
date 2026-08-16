# Weekly successful imports — marketing's north-star query

**For:** Marketing (requested in review-prompt.md) · **From:** Dev

Aggregate only — no per-user data. Run in the Supabase SQL editor (project
`dilla` / kxwerunvpjqgaviucqqj), or ask the dev session to run it:

```sql
-- Successful imports per ISO week (recipes actually saved), last 8 weeks
select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week_of,
       count(*) as recipes_imported,
       count(*) filter (where source_platform in ('instagram','tiktok')) as from_social,
       count(distinct user_id) as active_importers
from recipe_recipes
where created_at > now() - interval '8 weeks'
group by 1 order by 1 desc;
```

Companion numbers when wanted:

```sql
-- Signups per week
select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week_of, count(*) as signups
from auth.users
where created_at > now() - interval '8 weeks'
group by 1 order by 1 desc;

-- Free users who hit a cap this month (conversion-pressure gauge)
select count(*) filter (where imports >= 20) as hit_import_cap,
       count(*) filter (where coalesce((by_kind->>'video')::int, 0) >= 5) as hit_video_cap,
       count(*) as active_this_month
from recipe_usage
where period = to_char(now() at time zone 'utc', 'YYYY-MM');
```

(Cap numbers auto-track whatever `plan_limits()` currently enforces — update the
literals here if the free tier changes in v2.)
