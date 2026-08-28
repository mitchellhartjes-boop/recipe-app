# v2 (version 1.1) — everything to do in App Store Connect

Build is green and uploaded. Work top to bottom; the ordering matters where noted.

---

## 1. Create the version

App Store Connect → Dilla: Recipe Vault → **+ Version or Platform → iOS**, enter
**1.1**. (v1.0 is released and closed; the build already reports 1.1.)

Then on that version page: **Build → select build 39** (the successful upload).

> ### ✅ DECIDED 2026-08-28: Option B. Do NOT submit build 39.
>
> Owner chose B. Supabase anonymous sign-ins are ON and verified on production
> web (anonymous session created, `is_anonymous: true`, recipe written and read
> back under RLS, purchase gate shown). A new build is being cut from `dab04e9`.
> **Select that build, not 39.**
>
> Original framing kept below for the record:
>
> ### ⚠ build 39 has no no-signup flow
>
> Build 39 was cut before commit `605462c`. It contains all of v2 Phase A
> (editing, manual entry, scaling, unit switching, priority, 7 meal slots) but
> **not** anonymous sign-in — a reviewer opening build 39 sees the signup form.
> The anonymous work is committed and live on web; iOS needs a new binary.
>
> **Option A — ship build 39 now.** Fastest. The signup wall stays until the
> next release. Reviewer notes must NOT mention "Start cooking" (the conditional
> paragraph in `app-store-submission.md` §6 stays unpasted), and What's New says
> nothing about signup.
>
> **Option B — cut a new build with `605462c`.** Costs one Codemagic run plus
> TestFlight processing, and requires the Supabase anonymous toggle ON *first*,
> or the flow dead-ends in the reviewer's hands. Buys the single biggest
> activation fix available, in the same review cycle rather than one later.
>
> Marketing rates the signup wall as the top activation leak, which argues for B
> — but B is only safe once the toggle is verified by tapping the button on a
> real build. **Do not part-do this:** notes claiming the flow while the build
> lacks it is the 2.1 rejection we already spent a month on.
>
> If B, add to What's New: `• Start cooking straight away — no signup, no password. Add an email whenever you want your recipes on a new phone.`

## 2. What's New in This Version  ← required for updates, wasn't needed for v1.0

```
Recipes are yours to edit now.

• Fix anything — a typo, an amount, a step. Every recipe is editable.
• Write recipes from scratch, for the ones that never had a link: family cards, cookbooks, your own inventions. Doesn't count against your monthly imports.
• Better scaling — doubling and tripling now gives amounts you can actually measure, and grams turn into kilos when they should.
• Switch any recipe between metric and US units (Pro).
• Pro imports jump the queue.
• A full week of meal slots instead of five.
• Start cooking straight away — no signup, no password. Add an email whenever you want your recipes on a new phone.
```

The last line ships only because Option B was taken. If the build being
submitted ever reverts to 39, remove it.

## 3. Description — the free-tier flip, and dropping the hard prices

Find:

> Save up to 20 recipes a month free, including video extractions. Dilla Pro raises that to 200 a month for $4.99/month or $29.99/year.

Replace with:

> Save up to 10 recipes a month free, including 3 video extractions. Dilla Pro raises that to 200 a month, including 40 video imports.

**Two changes in one line, and the second matters more than it looks.** Dropping
the dollar figures is what turns price into a knob we can turn any time: App
Store Connect price changes take effect immediately with NO review, but a
*description* edit needs a whole version submission. Quoting prices in the
description is what chained them together. Apple does not require it — the store
page shows live subscription prices automatically, and the in-app paywall shows
real StoreKit prices before purchase, which is what Guideline 3.1.2 actually
asks for.

Optional but worth it — add to the **BUILT FOR THE COUNTER** block:

> • Edit any recipe, or write one from scratch

**Nothing else in the description changes.** Leave the Privacy Policy and Terms
of Use lines exactly as they are — the Terms line is what cleared the first
automated rejection.

## 4. The price rise — now decoupled, so DON'T ship it with v2

Marketing (D-058) recommends staggering the rise to $6.99/$39.99 rather than
stacking it on the free-tier cut, and the reasoning holds:

- 10/3 already halves the free-user cost ceiling (~$1.00 → ~$0.45), so the rise
  is no longer a survival argument, just an LTV one.
- A user hitting the wall in v2 would meet a halved allowance AND a 40% rise in
  the same moment — aimed at the exact cohort our pitch courts.
- Stacked changes destroy attribution: 10/3 is the biggest conversion lever in
  the plan and we would not be able to read it.

Marketing costed this as "a second submission." With the prices out of the
description (§3) **it costs nothing** — the rise becomes an ASC price edit,
immediate, no review, no version.

Decision rule, fixed in advance, using cap-hitter conversion from instrumentation:

| Cap-hitter conversion | Action |
|---|---|
| ≥ 2% | Raise to $6.99 / $39.99 |
| < 1% | Do NOT raise — it is a paywall-presentation problem |
| In between | Raise annual to $39.99 only; leave monthly at $4.99 |

Existing subscribers keep their price unless you explicitly opt them in (Apple
asks — say no). Landing page and press kit quote prices too, but those are
instant deploys with no review, so they simply move on the same day.

## 5. The 30-day free trial (optional, but the paywall is already built for it)

Monetization → Subscriptions → **Dilla Pro Monthly** → Introductory Offers → **+**
→ Free trial, **30 days**, all territories, no end date.

The paywall reads the store's real intro price, so the "Start with 30 days free"
line appears only once this exists — it can never promise a trial you haven't
configured. Do the same on Yearly if you want it there too.

## 6. Things that DO NOT change (verify, don't edit)

- **App Privacy** — no new data collection. The review prompt uses only local
  device storage, no analytics, no server calls.
- **Age rating** — unchanged (17+ from Unrestricted Web Access).
- **Screenshots** — still accurate. Optional refresh: the grocery shot shows five
  meal slots and there are now seven.
- **Subscriptions themselves** — already approved and live. They do NOT need
  resubmitting unless you edit their metadata.
- **Export compliance** — `ITSAppUsesNonExemptEncryption=false` ships in the
  build, so no prompt appears.

## 7. App Review Information

Demo account still valid — confirm the password works, and keep it valid even
under Option B: anonymous sign-in does not replace the demo account, because a
reviewer checking subscription restore needs a real signed-in account. Keep the
existing notes and add:

```
This update adds recipe editing and manual recipe entry (both free), improved ingredient scaling, unit switching between metric and US (Pro), priority processing for Pro imports, and a seven-day meal plan.

The app's data handling is unchanged from the approved 1.0: shared links are analyzed transiently server-side to produce a plain-text recipe, and no video or audio is ever saved or served to users.
```

## 8. Submit — and tell Claude FIRST

**At submission, exactly ONE dev-side change:**

1. **`DISCOVER_SEARCH_NATIVE` off** for the review window, so the reviewer sees
   the same browser-mode Discover that passed review the first time.

**The free-tier flip does NOT happen here — it happens at APPROVAL.** (Corrected
2026-08-28; the earlier version of this checklist had it at submission, which was
wrong.)

A version's description only goes live when that version is **released**, not
when it is submitted. v1.0 is live right now and its description advertises
**20/month**. Flipping the server at submission would cap every existing user at
10 while the store still promises 20, for the whole review window — a month, last
time. That is the exact listing-vs-app mismatch the batching rule exists to
prevent, just pointing the other way.

The reviewer seeing 20 in the app while the new description says 10 is not a
risk: the app is *more* generous than described, and Apple rejects apps that
promise more than they deliver, not less.

So: finish §1–§7, say the word, Claude turns Discover native off, then hit
**Add for Review → Submit**. The flip fires the day v2 is approved (§9).

## 9. After approval

- **Run the free-tier flip to 10/3 NOW, as one batch**: `plan_limits()` +
  `_lib/usage.mjs` PLANS + landing page + press kit, released together with the
  v2 listing going live (see `v2-tier-flip-checklist.md`). Server and store then
  say 10/3 at the same moment.
- Flip `DISCOVER_SEARCH_NATIVE` back on.
- Watch the first reviews for "only 10 free" complaints — the cap is server-side
  and revertible in minutes.
- Pull the p90 of monthly imports once real usage accumulates.
- Marketing's loud launch fires on approval, not on a date.
