# Dilla — backlog

See `CLAUDE.md` for architecture/runbook and `docs/app-store-submission.md` for the store package.
**Status: v1.0 SUBMITTED to App Review (2026-07-28)** — version + both subscription products in one
review bundle; `DISCOVER_SEARCH_NATIVE` is OFF for the review window.

## ⏳ At approval (server-side, no app update)

- Flip `DISCOVER_SEARCH_NATIVE=true` on Netlify — native Discover result cards go live everywhere.
- Verify one real production purchase + Restore Purchases on the App Store build.

## 🎯 v1.1 — owner-requested (priority order)

1. **Editable recipes + manual entry.** Fix extraction typos in place and type a family recipe in
   from scratch. The biggest UX hole in v1.0 — users will ask within the first week.
2. **Measurement scaling cleanup** (`src/lib/scale.ts`): doubling/tripling produces awkward amounts
   (odd fractions/snaps). Round scaled quantities to cook-friendly numbers.
   **Plus new feature: unit switching** (imperial ↔ metric, cups ↔ grams where convertible).
3. **Grocery tab: allow up to 7 meals** in "This Week's Meals" (currently 5) — or make the slot
   count user-adjustable.

### Tier strategy (decided pre-launch; revisit with data)

- Launch tiers stand: free 20/mo incl 5 video; Pro 200/40. The free caps intercept the day-one
  backlog binge (everyone arrives with saved reels), which is the peak-excitement conversion moment;
  the 5-video sub-cap is the sharper trigger than the 20.
- **2–4 weeks post-launch: pull the `recipe_usage` distribution** (% hitting caps, medians) and tune
  limits server-side (`plan_limits()` + PLANS) — no app update needed.
- **Pro-lane additions for v1.1:** priority worker queue for Pro (order by plan, one-line change;
  "your reels import first"), unit switching as a Pro perk. Editing stays FREE — gating a user's
  own data reads as hostile.

## 📋 Owner action items (not code)

- **Register a DMCA agent with the US Copyright Office** (~$6, online, ~10 min) — the safe-harbor
  shield for user-imported content. Pair with a `/terms` page carrying the takedown policy
  (Claude drafts it on request).
- Rotate chat/binary-exposed secrets: `SHORTCUT_TOKEN`, the old `tbgimscpdrdwsernwfni` service key,
  Apify proxy password — plus the older list (Anthropic/Groq keys, app password, PATs).
- Transfer `finance-app` + the old Supabase project to a free org → the Pro org bills $25 flat.
- Netlify paid tier as traffic grows; custom SMTP for Supabase auth emails.

## 🔧 Post-launch engineering

- Re-host the ~92 legacy recipe covers from the old project's public bucket into `dilla`'s storage
  and update `image_url`s (old URLs keep serving meanwhile).
- Drop the legacy dilla tables from the old (VITAL) project after a soak period.
- Migrate VITAL to its own Supabase project (open anon-key policies shouldn't share a project with
  anything else).
- Link-in-bio recovery: sitemap fallback for non-WordPress blogs (~+10%); Pinterest video-pins via
  the video pipeline; YouTube Shorts.
- Recipe sharing TO friends (export / deep link) — the natural growth loop.
- Website-extractor hardening (consent walls, odd markup); real-world test URLs in `scripts/`.
- Atomic job claiming (`UPDATE … WHERE status='queued'`) if ever running overlapping workers.

### Cost guards (unit costs: text ~1¢, screenshot ~2-3¢, video ~8-12¢; free user hard-capped ≈$0.90/mo)

- **Owner, no code: set hard monthly spend limits in the Anthropic + Groq consoles** — makes a
  surprise bill impossible regardless of growth.
- **Video vision → Haiku experiment**: the priciest path drops ~70% (to ~3¢/video) if quality holds
  on real reels. Biggest single lever on the cost model.
- **Meter Discover searches** (only per-user cost with no cap): fold into monthly limits or a
  per-day throttle (~100/day). Signed-in-only already; this closes the scripted-abuse edge.
- Tier limits + pricing live server-side (`plan_limits()` SQL + `_lib/usage.mjs` PLANS) — tuning the
  free/pro caps is a deploy, never an app update.

## Known limit: audience-restricted reels

~1 in 6 reels are audience-restricted ("can't be seen by certain audiences"). **No third party can
read these** — embed, yt-dlp, and Apify all fail because the restriction is per-viewer. The app shows
an honest message and suggests the screenshot path, which works for anything visible on screen.
