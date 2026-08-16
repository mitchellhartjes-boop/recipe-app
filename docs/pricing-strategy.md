# Dilla — pricing & unit-economics strategy

Written 2026-08-14, pre-launch. Companion to BACKLOG.md's tier-strategy section.
All AI costs grounded in the actual pipeline (video vision = Sonnet, 16 frames max,
configurable via `VISION_MODEL`; text extraction = Haiku; screenshots = Sonnet vision).

## 1. Unit costs per import (current architecture)

| Path | Components | Cost |
|---|---|---|
| Caption / website / link-in-bio | Haiku extraction | **$0.005–0.01** |
| Screenshot | Sonnet vision (1 image) | **$0.02–0.03** |
| Video — Instagram | Apify fetch ~$0.03–0.05 + Groq audio ~$0.003 + Sonnet 16-frame vision ~$0.08 | **~$0.11–0.13** |
| Video — TikTok | Often free subtitles (skips Groq); otherwise same | **~$0.08–0.12** |
| Discover search | Serper (2–8 credits) | $0.001–0.008 (currently unmetered) |

**The insight that shapes everything: video is ~10× text.** The free tier's cost profile
is dominated by its 5 video slots (~$0.60 of the ~$1.00 worst case). Pricing strategy
is really video strategy.

## 2. What a free user costs

| Persona | Share (est.) | Monthly usage | Cost |
|---|---|---|---|
| Casual | ~60% | 4 imports, ~0.5 video | ~$0.09 |
| Regular | ~30% | 10 imports, 2 video | ~$0.32 |
| Enthusiast (caps out) | ~10% | 20 imports, 5 video | ~$0.90 |
| **Blended** | | | **~$0.20–0.25** |

**Hard ceiling: ~$1.00/free user/month.** Enforced server-side (atomic metering with
refunds). Total worst case = users × $1 — losses are linear and capped by design,
never exponential. Provider spend caps (Anthropic/Groq consoles — OWNER ACTION, still
pending) make the absolute monthly bill a hard number regardless of any bug.

## 3. What a Pro user pays vs costs

Revenue net of Apple's 15% Small Business Program cut:
- Monthly $4.99 → **$4.24/mo**
- Annual $29.99 → $25.49/yr = **$2.12/mo**

| Pro persona | Usage | Cost | Margin (monthly plan) |
|---|---|---|---|
| Realistic | 40 imports, 8 video | ~$1.35 | +$2.89 |
| Heavy | 100 imports, 20 video | ~$3.10 | +$1.14 |
| Whale (maxes 200/40) | 160 text + 40 video | ~$6.40 | **−$2.16** |

A maxed-out Pro loses money (worse on annual). Acceptable: whales are rare, caps make
the worst case small, and the Haiku lever (below) moves whale cost to ~$4.40 ≈ break-even.
Watch the distribution once real data exists; the 200/40 caps are server-tunable.

## 4. Fixed costs

| | Now | At ~1K users |
|---|---|---|
| Supabase Pro | $25 | $25 |
| Netlify | $0 | ~$19 |
| Apify | free credits | ~$39 tier (or usage) |
| Apple Developer | $8.25/mo amortized | $8.25 |
| **Total fixed** | **~$33** | **~$91** |

## 5. Scale P&L (monthly, blended free cost $0.22, realistic Pro cost $1.35)

| Users | Conv. | Free cost | Pro cost | Fixed | Revenue | **Net** |
|---|---|---|---|---|---|---|
| 100 | 3% | $21 | $4 | $33 | $13 | **−$45** |
| 1,000 | 3% | $213 | $41 | $91 | $127 | **−$218** |
| 1,000 | 5% | $209 | $68 | $91 | $212 | **−$156** |
| 1,000 | 8% | $202 | $108 | $91 | $339 | **−$62** |
| 1,000 | 8% + Haiku lever | ~$135 | ~$76 | $91 | $339 | **+$37** |
| 10,000 | 5% | $2,090 | $675 | ~$150 | $2,120 | **−$795** |
| 10,000 | 5% + Haiku + video-cap-3 | ~$1,100 | ~$500 | ~$150 | $2,120 | **+$370** |

Honest reading: at launch scale the app is a small monthly investment (tens of
dollars). The model turns profitable through some combination of (a) the Haiku lever,
(b) conversion ≥5% (trials are the proven driver), (c) tuning the free video cap.
All three are available and none requires an app update.

## 6. Decisions & recommendations

1. **REVISED 2026-08-14 (owner call): free tier tightens to 10/mo incl 3 video in v2.**
   The monthly reset is a conversion leak: most users' steady-state demand is under
   20/mo, so a renewing 20 is permanently sufficient — patient users never pay. The
   store listing under review promises 20/mo, so sequencing is: LAUNCH at 20 as
   submitted → flip server limits (`plan_limits()` + PLANS) and the description
   together in the v2 release. New free-user cost ceiling at 10/3: ~$0.45.
   **v2-scope decision — the structural fix: a lifetime LIBRARY CAP** (free = ~25
   recipes total; monthly metering stays as the cost guard; Pro = the big library).
   Matches how ReciMe/Crouton gate; pressure grows with the collection instead of
   resetting. Confirm with week-1/2 data: users returning at the monthly reset
   without converting = the smoking gun.
2. **Add a 7-day free trial on Monthly** (App Store Connect intro offer; RevenueCat
   picks it up automatically). Trials are the single biggest conversion lever for
   subscription apps; cost exposure per trial is capped at Pro limits (≈$6 absolute
   worst). Paywall copy line ("7 days free") ships with v2. CONFIGURE AT/AFTER APPROVAL.
3. **Run the Haiku video experiment immediately post-launch** — zero code: set
   `VISION_MODEL=claude-haiku-4-5` in worker.yml env for a day; `extraction_meta.model`
   records which model produced each recipe, so quality is comparable on real imports.
   If quality holds (likely — the transcript carries most of the signal), video AI cost
   drops ~70% and every scenario above improves. Also consider `maxFrames` 16→10.
4. **Meter Discover** (~100 searches/day/user) — closes the one uncapped per-user cost.
5. **Keep $4.99 / $29.99.** At the category's premium edge, justified by real recurring
   COGS competitors don't have. Revisit only with churn + conversion data, never before.
6. **Set Anthropic + Groq console spend caps** (owner, 10 minutes, still pending).

## 7. Decision rules once data lands (2–4 weeks post-launch)

Pull from `recipe_usage` (all queries already possible):
- % of monthly-active free users hitting the 20-cap, and the 5-video-cap
- Conversion rate of cap-hitters within 7 days (**north star for pricing**)
- Video share of total imports (drives blended cost)
- Pro usage distribution (whale check)

| Observation | Action |
|---|---|
| <5% of actives ever hit any cap | Free tier too generous → test 15/3 |
| Many hit caps, cap-hitter conversion ≥10% | Model works — scale content, touch nothing |
| Many hit caps, conversion <5% | Paywall presentation problem, not price — fix the upgrade moment first |
| Video >40% of imports | Prioritize Haiku + consider video cap 5→3 |
| Whale Pros >15% of Pro base | Consider 200/40 → 150/30 (server-side) |

## 8. The bottom-line answer to "will I lose money on free users?"

No — not in any uncontrolled way. Per-free-user cost has a **hard $1/month ceiling**
enforced server-side; realistic blended cost is ~$0.22; total spend scales linearly
with users and is additionally capped by provider spend limits. The exposure at every
scale is a known, small number — and every lever to shrink it (model choice, caps,
metering) deploys server-side without App Review.
