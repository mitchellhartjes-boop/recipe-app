# v2 (version 1.1) — everything to do in App Store Connect

Build is green and uploaded. Work top to bottom; the ordering matters where noted.

---

## 1. Create the version

App Store Connect → Dilla: Recipe Vault → **+ Version or Platform → iOS**, enter
**1.1**. (v1.0 is released and closed; the build already reports 1.1.)

Then on that version page: **Build → select build 39** (the successful upload).

## 2. What's New in This Version  ← required for updates, wasn't needed for v1.0

```
Recipes are yours to edit now.

• Fix anything — a typo, an amount, a step. Every recipe is editable.
• Write recipes from scratch, for the ones that never had a link: family cards, cookbooks, your own inventions. Doesn't count against your monthly imports.
• Better scaling — doubling and tripling now gives amounts you can actually measure, and grams turn into kilos when they should.
• Switch any recipe between metric and US units (Pro).
• Pro imports jump the queue.
• A full week of meal slots instead of five.
```

## 3. Description — ONE line changes (the free-tier flip)

Find:

> Save up to 20 recipes a month free, including video extractions. Dilla Pro raises that to 200 a month for $4.99/month or $29.99/year.

Replace with:

> Save up to 10 recipes a month free, including 3 video extractions. Dilla Pro raises that to 200 a month for $4.99/month or $29.99/year.

Optional but worth it — add to the **BUILT FOR THE COUNTER** block:

> • Edit any recipe, or write one from scratch

**Nothing else in the description changes.** Leave the Privacy Policy and Terms
of Use lines exactly as they are — the Terms line is what cleared the first
automated rejection.

## 4. DECISION — the price change

Marketing proposed $4.99 → **$6.99**/mo and $29.99 → **$39.99**/yr, arguing it
roughly doubles profit per install and that price is cleanest to set before a
subscriber anchor exists.

- If YES: Monetization → Subscriptions → each product → **Price**. Takes effect
  immediately, no review. **Existing subscribers keep their old price** unless
  you explicitly opt to raise theirs (Apple asks; say no).
- If NO: change nothing. The description quotes $4.99/$29.99 either way — so if
  you DO raise prices, the description above must be updated in the same pass.

Not deciding is also a decision: prices stay.

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

Demo account still valid — confirm the password works. Keep the existing notes and
add:

```
This update adds recipe editing and manual recipe entry (both free), improved ingredient scaling, unit switching between metric and US (Pro), priority processing for Pro imports, and a seven-day meal plan.

The app's data handling is unchanged from the approved 1.0: shared links are analyzed transiently server-side to produce a plain-text recipe, and no video or audio is ever saved or served to users.
```

## 8. Submit — and tell Claude FIRST

Two things must happen on the dev side **in the same window as your submit**:

1. **Free-tier flip to 10/3** — `plan_limits()` migration + `PLANS` deploy +
   landing page + press kit, all together (see `v2-tier-flip-checklist.md`).
   The description edit in §3 and this deploy must land together, or the live
   listing and the live app disagree.
2. **`DISCOVER_SEARCH_NATIVE` off** for the review window, so the reviewer sees
   the same browser-mode Discover that passed review the first time.

So: finish §1–§7, say the word, let Claude run both, then hit **Add for Review →
Submit**.

## 9. After approval

- Flip `DISCOVER_SEARCH_NATIVE` back on.
- Watch the first reviews for "only 10 free" complaints — the cap is server-side
  and revertible in minutes.
- Pull the p90 of monthly imports once real usage accumulates.
- Marketing's loud launch fires on approval, not on a date.
