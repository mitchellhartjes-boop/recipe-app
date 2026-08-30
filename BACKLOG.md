# Dilla — roadmap & backlog

See `CLAUDE.md` for architecture/runbook and `docs/app-store-submission.md` for the store package.
**Status: v1.0 APPROVED and RELEASED (App ID 6793520987). Quiet launch; v2 Phase A is built.**

## ✅ Done at approval

- ✅ `DISCOVER_SEARCH_NATIVE=true` — native Discover cards live everywhere.
- ✅ App Store link + smart banner on the landing page and press kit.
- ⬜ **OWNER:** verify one real production purchase + Restore Purchases on the store build.

---

## 🚀 v2 — the fast follow (Phase A BUILT, awaiting a Codemagic build + submission)

Theme: fix what week-one users will hit, and give Pro a story beyond bigger numbers.
Everything here is app-binary work (one Codemagic build + review cycle).

1. ✅ **Editable recipes + manual entry** (FREE for everyone — gating a user's own data reads as
   hostile). Edit any saved recipe in place (fix extraction typos, tweak amounts, add notes) and
   create a recipe from scratch. Reuse the ReviewRecipe form as the editing surface.
   The headliner: the #1 thing v1.0 users will ask for.
2. ✅ **Measurement scaling cleanup** (`src/lib/scale.ts`, FREE): doubling/tripling currently produces
   awkward fractions/snaps — round scaled quantities to cook-friendly numbers.
3. ✅ **Unit switching** (PRO perk): imperial ↔ metric, cups ↔ grams where convertible, on the recipe
   page and in Cook Mode.
4. ✅ **Priority processing** (PRO perk, server + paywall copy): Pro users' video imports jump the
   worker queue (order by plan, then created_at). "Your reels import first."
5. ✅ **Grocery: up to 7 meal slots** in "This Week's Meals" (currently 5), or user-adjustable (FREE).
6. ✅ **Paywall refresh**: perks list gains the two new Pro bullets + "7 days free" trial line;
   retake the subscription review screenshot with live prices.
7. ✅ **In-app review prompt** (spec: docs/marketing-specs/review-prompt.md) — native
   SKStoreReviewController at the 2nd Cook Mode completion (fallback: 10th import), with the
   spec's guards. Local flags only; no sentiment-gating.
8. ⬜ **Free-tier flip to 10/mo incl 3 video** — DECIDED (owner, see Tier strategy). Ships as ONE
   batch at v2 APPROVAL, not submission (a version's description only goes live
   when it is released; flipping earlier caps live v1.0 users at 10 while the
   store still advertises 20): `plan_limits()` + `_lib/usage.mjs` PLANS + App Store description +
   landing page + press kit. Never flip the server alone — the live listing quotes the numbers.

**Before submitting v2:** create the 30-day intro offer in App Store Connect (the
paywall's trial line only appears once the store actually returns a free intro
price); apply the price change WITH the description edit; check the App Privacy
label if any instrumentation ships; flip `DISCOVER_SEARCH_NATIVE` OFF for the
review window; smoke-test the review prompt cannot fire during review (it needs
3 days of install age, so a fresh reviewer install will never see it).

App Store version number: ship as 1.1 internally is fine, but marketing-wise call it what it is —
decide at submission (Apple doesn't care).

## 🔮 v3 — bigger bets (shape AFTER v2 + usage data)

Owner-confirmed candidates, roughly ordered; final scope decided once real usage lands:

- **Recipe sharing TO friends** (export / deep link / "sent you a recipe" flow) — the natural
  growth loop and the strongest candidate for v3's headliner.
- **Import coverage expansion**: YouTube Shorts; Pinterest video-pins through the video pipeline;
  link-in-bio sitemap fallback for non-WordPress blogs (~+10% recovery). (Server-heavy — pieces can
  land continuously; grouped here as the marketable "import everything" story.)
- **Meal planner v2**: link actual recipes (not just text) to the week, portions → grocery list.
- **Nutrition estimates** (competitor parity with ReciMe; AI-estimated, clearly labeled).
- **Collections / custom folders** beyond the automatic categories.
- Family Sharing for Pro / iPad layout — candidates, unscoped.

## 📊 Instrumentation — marketing's #1 ask (pre-launch where possible)

Seven aggregate, first-party, server-side metrics. No third-party SDK (it would
contradict the no-tracking position). Most are derivable from existing tables today;
the ones marked (needs event) require new writes.

1. Extraction outcome + completeness rate by source type — partly derivable now
   (`extraction_meta.confidence`, ingredient/step counts); richer with the v2 receipt UI.
2. Cook-through rate within 14 days — **already possible**: `recipe_recipes.times_made`
   exists and is incremented by both Cook Mode completion and the "Made it" button.
   Needs a first-cooked timestamp for the 14-day window (needs event, small).
3. "View original" tap-through (needs event).
4. Distribution of monthly imports across free users incl. **p90** — available NOW from
   `recipe_usage`; this is the number that settles the tier conflict above.
5. Activation funnel step completion (needs events).
6. Cap-hit rate + cap-hitter conversion within 7 days — derivable now from
   `recipe_usage` + `recipe_profiles`.
7. Paywall funnel by trigger (needs events).

**Blocking check before ANY new usage event ships:** the App Privacy questionnaire
(docs/app-store-submission.md §5) already declares Usage Data → Product Interaction,
linked to identity, purpose *App Functionality*. Metrics used for product analytics
rather than enforcing plan limits may require adding the **Analytics** purpose to that
label. Label update must land before/with the release that ships the events.

## 🧹 Anonymous-account housekeeping (once anonymous sign-in is live)

- Supabase does NOT auto-clean anonymous users; they accumulate in auth.users.
  Purge only ones that never produced anything, so a real library is never
  destroyed:
  ```sql
  delete from auth.users u
  where u.is_anonymous is true
    and u.created_at < now() - interval '60 days'
    and not exists (select 1 from public.recipe_recipes r where r.user_id = u.id);
  ```
- Anonymous sign-in is IP rate limited to 30/hour (Supabase default). If abuse
  appears, enable CAPTCHA (Auth > Attack Protection) — Supabase's recommended
  mitigation for this endpoint.
- Watch free-tier farming: reinstall = new anonymous user = fresh quota. Bounded
  by the per-user cost ceiling, so it is a slow leak rather than a hole.

## 🔄 Continuous — server-side, ships anytime (no app release, no review)

- **2–4 weeks post-launch: pull the `recipe_usage` distribution** (% hitting caps, medians;
  the key metric = conversion rate of cap-hitters within a week) and tune tiers via
  `plan_limits()` + PLANS — a deploy, never an app update.
- **Video vision → Haiku experiment**: priciest path drops ~70% (to ~3¢/video) if quality holds.
- **Meter Discover searches** (~100/day or fold into monthly caps) — the one uncapped per-user cost.
- Re-host the ~92 legacy covers from the old project's bucket; update `image_url`s.
- Drop legacy dilla tables from the old (VITAL) project after a soak period; migrate VITAL to its
  own project eventually.
- Website-extractor hardening (consent walls, odd markup); real-world test URLs in `scripts/`.
- Atomic job claiming (`UPDATE … WHERE status='queued'`) if ever running overlapping workers.

## 📋 Owner action items (not code)

- **Tonight-cheap: hard monthly spend limits in the Anthropic + Groq consoles** — makes a surprise
  bill impossible. (Unit costs: text ~1¢, screenshot ~2-3¢, video ~8-12¢; free user hard-capped
  ≈$0.90/mo by the metering.)
- **Register a DMCA agent with the US Copyright Office** (~$6, ~10 min) + `/terms` page with the
  takedown policy (Claude drafts on request).

### Creator-relations / IP insurance (marketing, 2026-08-21 — cheap, fatal if unprepared)

- **Server-side kill switch for link-in-bio recovery.** Highest-value item here: that
  feature is mechanically what killed Recipeasly in 24 hours in 2021. A config toggle
  (same pattern as `DISCOVER_SEARCH_NATIVE`) turns a multi-day crisis into a two-hour one.
- `/creators` page: what Dilla writes down, what it never touches, how attribution works,
  plus one-click handle-level opt-out.
- Written repeat-infringer policy + a real takedown workflow (pairs with the DMCA agent).
- Honest named bot User-Agent with a contact URL; honor robots.txt.
- Source TikTok attribution from the official key-free oEmbed endpoint so a sanctioned
  interface can be named in any 5.2.2 reply. (Already the case in `_lib/tiktok.mjs` —
  verify before citing it.)
- Rotate chat/binary-exposed secrets: `SHORTCUT_TOKEN`, old `tbgimscpdrdwsernwfni` service key,
  Apify proxy password, plus the older list (Anthropic/Groq keys, app password, PATs).
- Transfer `finance-app` + the old Supabase project to a free org → Pro org bills $25 flat.
- Netlify paid tier as traffic grows; custom SMTP for Supabase auth emails.

## Tier strategy (full model in docs/pricing-strategy.md)

**RULING (owner, 2026-08-27): free tier becomes 10/month including 3 video.**
- Rationale: the monthly reset leaks. Most users' steady-state demand is under 20, so a
  renewing 20 never forces a decision — it reads as a free product with a speed bump.
- Marketing had argued for keeping 20 as an advertising asset pending p90 data; owner
  overruled, and marketing has stood down (no further lobbying until data exists).
- Shape is deliberate: 10 total with 3 video makes VIDEO the scarce thing, which is the
  differentiator. "You've used your 3 video imports" is a wall that explains itself and
  points straight at what Pro is for.
- Blast radius is smallest NOW (a handful of users), and the value is server-side, so a
  revert is minutes if reviews complain. Watch the first reviews after v2 ships.
- Free-user cost ceiling drops from ~$1.00 to ~$0.45/month as a side effect.

Settled either way:
- **Launch at 20/5** — matches the store listing under review. Non-negotiable sequencing:
  server limits and the App Store description flip together, never separately.
- **Trial: 30 days, fired at the cooking-layer paywall** (supersedes the earlier
  7-day-on-monthly plan). Marketing's data: 17–32 day trials convert ~42.5% vs ~25.5%,
  and the cost objection was arithmetic error — the ~$6 Pro ceiling is MONTHLY, so a
  maxed 30-day trial costs ~$5.60 (~$2.50 after the Haiku lever).
- **Lifetime library cap** stays a v2 candidate, to be decided with the same p90 data.
- **Price:** marketing proposes $4.99→$6.99/mo and $29.99→$39.99/yr in week one, before
  a subscriber anchor exists (Small Business Program confirmed = 85% net). OWNER
  DECISION. If taken, it is not just an ASC change — the landing page, press kit, and
  App Store description all quote the old prices and must move in the same batch.
- Editing stays free forever.

## Known limit: audience-restricted reels

Two different things used to be lumped together here, and only one of them is a
real limit.

- **Age-gated** reels: the anonymous embed is refused, but Apify reads Instagram
  through logged-in accounts and clears the gate. **These now import** (fixed
  2026-08-30, verified on a live reel) — walled reels are handed to the worker
  instead of being declared unreadable.
- **Audience-restricted** reels ("can't be seen by certain audiences"): genuinely
  unreadable. The restriction is per-viewer, so no third party can see them —
  Apify returns `restricted_page`. The app says so plainly, refunds the import,
  and suggests the screenshot path, which works for anything visible on screen.

The old "~1 in 6 reels are unreadable" figure counted both categories and is
therefore too pessimistic. Do not quote it until real numbers exist — the
instrumentation item above (extraction outcome by source type) is what settles it.
