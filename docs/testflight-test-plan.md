# TestFlight test plan — the Option B build (`c9cdd38`)

Everything below is either new in this build or has never run on a device.
Order is deliberate: the things that would block submission come first.

---

## A. Blockers — must pass before submitting

**1. Anonymous sign-in on iOS**
- [ ] Delete the app first (so it launches with no session), reinstall from TestFlight
- [ ] Tap **Start cooking** → lands in the library, no form, no error
- [ ] If it falls back to the signup form: that is the failure. Settings →
      diagnostics → run the SharedStore probe and send me the output.

**2. Share a reel while anonymous** ← the one that matters most
- [ ] From Instagram/TikTok, Share → Dilla
- [ ] Notification arrives, recipe lands in the library
- [ ] This is the App Group + share-key path. Server side is verified; the
      native handoff is not. If it says "open Dilla first", the App Group write
      failed — not the anonymous account.

**3. Securing the account keeps everything**
- [ ] Settings → **Save my recipes** → enter an email + password
- [ ] Recipes still there, count unchanged
- [ ] Settings no longer offers the form
- [ ] Force-quit, reopen — still signed in, still has the recipes
- [ ] Success looks like *nothing visibly changing*. Same account, now recoverable.

**4. Paywall gate**
- [ ] While anonymous, open Upgrade → shows "First, save your account", not buy buttons
- [ ] After securing (step 3), Upgrade → shows real prices from StoreKit

**5. Existing accounts still work** (regression — I changed the login screen)
- [ ] Sign out, choose **Sign in**, use your own email/password
- [ ] Library intact
- [ ] Share a reel → lands in *this* account (the attribution bug from before)

---

## B. v2 features — built, never run on a device

- [ ] **Edit a recipe**: fix a typo, change an amount, save, reopen — it stuck
- [ ] **Write a recipe from scratch**: Add → write one manually
- [ ] **Manual entry is unmetered**: note the "x of 20" in Settings before and
      after — it must NOT go up
- [ ] **Scaling**: double and triple a recipe — amounts should be measurable
      (no `0.375 cups`), and grams should become kg only past 1000
- [ ] **Unit switching**: free account shows Metric/US locked 🔒; Pro shows them working
- [ ] **Grocery**: "This Week's Meals" has 7 slots, not 5
- [ ] **Cook Mode**: ingredients per step, timers keep running across steps,
      screen stays awake, no overlap with the page underneath

---

## C. Money path — still completely untested

- [ ] One **real purchase** on the App Store build (not sandbox)
- [ ] **Restore Purchases** on a second device or after a reinstall
- [ ] Settings flips to Pro (200/mo) after the RevenueCat webhook fires

This has never been done end to end. It is the only path where a silent failure
costs actual money rather than a bug report.

---

## D. Known — do not chase

- **Review prompt won't appear.** It needs 3 days of install age by design, so a
  fresh TestFlight install will never show it. That is also why a reviewer can't
  trigger it.
- **Priority queue** is only observable under load; not worth testing by hand.
- **Audience-restricted reels** ("can't be seen by certain audiences") cannot be
  read by anyone — the restriction is per-viewer. The app now refunds the import
  and points at the screenshot path. Age-gated reels are a DIFFERENT thing and
  do import (fixed 2026-08-30).

---

## After it passes

Tell me and I will:
1. Tick the third gate box in `app-store-submission.md` so the no-signup
   paragraph is cleared to paste into the reviewer notes
2. Run the free-tier flip to 10/3 and turn `DISCOVER_SEARCH_NATIVE` off, in the
   same window as your submit
