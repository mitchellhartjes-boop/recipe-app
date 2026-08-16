# Dilla — roadmap & backlog

See `CLAUDE.md` for architecture/runbook and `docs/app-store-submission.md` for the store package.
**Status: v1.0 SUBMITTED to App Review (2026-07-28)** — version + both subscription products in one
review bundle; `DISCOVER_SEARCH_NATIVE` is OFF for the review window.

## ⏳ At approval (same day, server-side)

- Flip `DISCOVER_SEARCH_NATIVE=true` on Netlify — native Discover result cards go live everywhere.
- Verify one real production purchase + Restore Purchases on the App Store build.

---

## 🚀 v2 — the fast follow (target: submit within ~2 weeks of approval)

Theme: fix what week-one users will hit, and give Pro a story beyond bigger numbers.
Everything here is app-binary work (one Codemagic build + review cycle).

1. **Editable recipes + manual entry** (FREE for everyone — gating a user's own data reads as
   hostile). Edit any saved recipe in place (fix extraction typos, tweak amounts, add notes) and
   create a recipe from scratch. Reuse the ReviewRecipe form as the editing surface.
   The headliner: the #1 thing v1.0 users will ask for.
2. **Measurement scaling cleanup** (`src/lib/scale.ts`, FREE): doubling/tripling currently produces
   awkward fractions/snaps — round scaled quantities to cook-friendly numbers.
3. **Unit switching** (PRO perk): imperial ↔ metric, cups ↔ grams where convertible, on the recipe
   page and in Cook Mode.
4. **Priority processing** (PRO perk, server + paywall copy): Pro users' video imports jump the
   worker queue (order by plan, then created_at). "Your reels import first."
5. **Grocery: up to 7 meal slots** in "This Week's Meals" (currently 5), or user-adjustable (FREE).
6. **Paywall refresh**: perks list gains the two new Pro bullets + "7 days free" trial line;
   retake the subscription review screenshot with live prices.
7. **In-app review prompt** (spec: docs/marketing-specs/review-prompt.md) — native
   SKStoreReviewController at the 2nd Cook Mode completion (fallback: 10th import), with the
   spec's guards. Local flags only; no sentiment-gating.
8. **Free-tier flip to 10/mo incl 3 video** + matching description edit (see Tier strategy below).

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
- Rotate chat/binary-exposed secrets: `SHORTCUT_TOKEN`, old `tbgimscpdrdwsernwfni` service key,
  Apify proxy password, plus the older list (Anthropic/Groq keys, app password, PATs).
- Transfer `finance-app` + the old Supabase project to a free org → Pro org bills $25 flat.
- Netlify paid tier as traffic grows; custom SMTP for Supabase auth emails.

## Tier strategy (REVISED 2026-08-14 — full model in docs/pricing-strategy.md)

- **Launch at 20/5** (matches the store listing under review), then **tighten to 10/mo
  incl 3 video in v2** — server flip (`plan_limits()` + PLANS) and description edit
  together. Rationale (owner call): the monthly reset leaks — most users' steady-state
  demand is under 20/mo, so a renewing 20 never forces a decision.
- **v2 design decision: lifetime library cap** (free ≈ 25 recipes total; monthly video
  metering stays as the cost guard; Pro = the big library). Category-proven structure —
  conversion pressure grows with the collection instead of resetting monthly. Confirm
  with week-1/2 data: users returning at the monthly reset without converting = smoking gun.
- **7-day free trial on Monthly** (ASC intro offer, config at/after approval; paywall
  copy line in v2). Pro stays $4.99/$29.99 = 200/40. Editing stays free forever.

## Known limit: audience-restricted reels

~1 in 6 reels are audience-restricted ("can't be seen by certain audiences"). No third party can
read these — the restriction is per-viewer. The app shows an honest message and suggests the
screenshot path, which works for anything visible on screen.
