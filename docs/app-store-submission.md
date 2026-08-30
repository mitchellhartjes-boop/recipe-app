# App Store submission package

Everything needed to fill out App Store Connect for the first Dilla release.
Copy-paste the text blocks verbatim; checklists at the bottom.

---

## 1. App Information

| Field | Value |
|---|---|
| Name | `Dilla: Recipe Vault` (already set on the app record) |
| Subtitle (30 chars max) | `Save recipes from anywhere` |
| Primary category | Food & Drink |
| Secondary category | Lifestyle (optional) |
| Content rights | Does not contain third-party content |
| Age rating | Answer **Yes** to "Unrestricted Web Access" (the Discover tab's built-in browser). Everything else No. Result: **17+**. This is normal for recipe apps with a browser — Paprika is 17+ for the same reason. |
| Copyright | `© 2026 David Mitchell Hartjes` |
| Support URL | `https://recipe-vault-mh.netlify.app/support` |
| Marketing URL (optional) | `https://recipe-vault-mh.netlify.app` |
| Privacy Policy URL | `https://recipe-vault-mh.netlify.app/privacy` |

## 2. Promotional text (170 chars max — editable anytime without review)

```
Share a reel, get the full recipe. Dilla turns cooking videos, pins, and blog posts into clean step-by-step recipes — even when the recipe only lives in the video.
```

## 3. Description

```
Your saved folder is full of recipes you'll never find again. Dilla fixes that.

Found a recipe anywhere — a reel, a pin, a blog, a video? Share it to Dilla and keep scrolling. Dilla reads it in the background, writes it out properly with every amount and step, and sends you a notification when it's in your library. No copying, no typing, no screenshots of captions.

WORKS WITH THE WAY YOU ACTUALLY FIND RECIPES
• Instagram reels and posts — even when the recipe is only spoken in the video, Dilla watches and listens, then writes it out
• "Link in bio" recipes — Dilla follows the trail to the creator's site and grabs the real recipe
• TikTok videos, Pinterest pins, recipe blogs, and websites
• Screenshots — share a photo of any recipe and Dilla reads it

BUILT FOR THE COUNTER
• Cook Mode shows one big step at a time, with the exact ingredients that step needs
• Times written in a step become one-tap timers that keep counting while you move on
• The screen stays awake while your hands are covered in flour
• Scale the servings and every quantity rescales
• Edit any recipe, or write one from scratch — free, and it never counts against your monthly imports

PLAN THE WEEK
• Send a recipe's ingredients to your grocery list — just the ones you're missing
• Sort your library by most made, highest rated, or newest
• Rate recipes and track how many times you've cooked them

DISCOVER
• Search for new recipes right inside Dilla and save what looks good on the spot

FREE TO START
No signup, no card — tap once and start saving. Keep up to 10 recipes a month free, including 3 video extractions. Dilla Pro raises that to 200 a month, including 40 video imports. Add an email whenever you want your recipes on a new phone.

Your recipes are yours: no ads, no tracking, delete your account (and everything with it) anytime from Settings.

Privacy Policy: https://recipe-vault-mh.netlify.app/privacy
Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

Note: the description deliberately does NOT quote dollar prices. Prices change in
App Store Connect immediately with no review, but a description edit needs a
version submission — quoting prices chains them together for no benefit. The
store page shows live subscription prices on its own, and the in-app paywall
shows real StoreKit prices before purchase (what Guideline 3.1.2 asks for).

Note: the Terms of Use line in the description is REQUIRED by App Review for
auto-renewable subscriptions when using Apple's standard EULA (first
submission bounced on exactly this — automated check, metadata-only fix).

## 4. Keywords (100 chars max, comma-separated)

```
cookbook,meal planner,grocery list,cooking,video,reel,pin,save,import,organizer,keeper,dinner
```

Notes: "recipe" and "vault" are already indexed from the app name — don't waste
keyword characters repeating them. Brand names (Instagram/TikTok/Pinterest) are
deliberately excluded from name/subtitle/keywords to avoid a Guideline 2.3.7
trademark-metadata rejection; the description's factual "works with" mentions
are standard interoperability language and fine.

## 5. App Privacy questionnaire

Data collection: **Yes, we collect data.**

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality (account sign-in) |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality (screenshot imports) |
| User Content → Other User Content | Yes | Yes | No | App Functionality (saved recipes, grocery list) |
| Identifiers → User ID | Yes | Yes | No | App Functionality (account, subscription status) |
| Identifiers → Device ID | Yes | Yes | No | App Functionality (push notification token) |
| Purchases → Purchase History | Yes | Yes | No | App Functionality (subscription entitlement) |
| Usage Data → Product Interaction | Yes | Yes | No | App Functionality (monthly import count for plan limits) |

Everything else: Not collected. Tracking: **No** (nothing leaves the app for
ads/data brokers; no ATT prompt needed). Result badge: "Data Linked to You,"
no "Data Used to Track You."

## 6. App Review Information

**Demo account** (create before submitting):
1. Sign up in the app as `dilla.review@gmail.com` (or any address you control) with a strong password.
2. Import 5–6 recipes into it so the reviewer sees a real library (paste a few blog URLs into Add — no social accounts needed).
3. Enter that email + password in App Store Connect → App Review Information → Sign-In Information.

**Notes for the reviewer** (paste into the Notes field):

```
Dilla saves recipes the user finds elsewhere into a personal, private library.

NO SIGNUP REQUIRED: tapping "Start cooking" on the first screen signs the user in anonymously — an account is created, but it collects no email, password, or other personal information. An email can be added later from Settings (and is required only before purchasing a subscription, so it can be restored on a new device). Sign-in credentials are provided below for testing the signed-in paths.

HOW TO TEST IMPORT (no social media account needed):
1) Open any recipe page in Safari (e.g. a food blog), tap Share, choose Dilla — a notification confirms when it's saved. Or:
2) In the app, tap Add and paste any recipe URL.

The Share Extension uploads the shared link/image in the background; extraction runs server-side and the app notifies when the recipe is ready.

DISCOVER TAB: opens the selected platform's own public website in an in-app browser. Recipe extraction is always user-initiated (the "Get the recipe" bar). Dilla does not display feeds of platform content.

5.2.3 NOTE — NO MEDIA DOWNLOADING: Dilla has no capability to save, download, play back, export, or provide video/audio/media files to users, on device or via our servers. Shared links are analyzed transiently server-side solely to produce a plain-text recipe (title, ingredients, steps), similar to transcription; nothing is retained except the text. Every recipe shows creator attribution and a "View original" link back to the source platform.

SUBSCRIPTIONS: Dilla Pro (monthly/annual) raises the monthly import limit from 10 to 200. Purchases are processed by StoreKit via RevenueCat; the demo account is on the free tier, which is fully functional for review.

ACCOUNT DELETION: Settings → Delete account (required by 5.1.1(v)) — removes all data immediately.
```

### ⚠ Conditional paragraph — do NOT paste unless BOTH are true

The no-signup flow is **not in build 39** (build 39 predates commit `605462c`),
and it cannot run at all while anonymous sign-ins are disabled on the Supabase
project. Telling a reviewer to tap "Start cooking" when the build shows a signup
form is a false statement to Apple *and* a 2.1 "information needed" magnet — the
reviewer follows the instruction, the button is not there, and our description of
our own app is now unreliable to them.

Paste the paragraph below into the notes ONLY when:

1. [x] the build being submitted was cut from `605462c` or later — satisfied by the
       Option B build (`dab04e9`); **still false for build 39**, and
2. [x] Supabase → Authentication → Sign In / Providers → **Anonymous Sign-Ins is ON**
       — verified 2026-08-28 by tapping "Start cooking" on production web: anonymous
       session created, `is_anonymous: true`, recipe written and read back under RLS.
3. [x] verified on the actual TestFlight build 2026-08-28 — owner confirmed the
       full blocker set passed on device: "Start cooking" signs in, a shared reel
       lands in the anonymous library, securing the account preserves everything,
       the paywall gate behaves, and existing email accounts still work.

**All three boxes ticked — the paragraph below is CLEARED to paste.**

```
NO SIGNUP REQUIRED: tapping "Start cooking" on the first screen signs the user in anonymously — an account is created, but it collects no email, password, or other personal information. An email can be added later from Settings (and is required only before purchasing a subscription, so it can be restored on a new device).
```

If either box is unchecked, the demo account in §6 is how the reviewer gets in,
and the notes say nothing about signup. That is the safe default.

## 7. Screenshots

Final set (built, both 6.9" 1320×2868 and 6.5" 1284×2778), in upload order —
the first three are what store search shows, so they carry the differentiators:

1. **Share story** (marketing frame): "Share a reel. Get the recipe." — the
   reel → Dilla → notification → written-out recipe flow. The one thing
   competitor listings can't claim.
2. **Recipe page** — "Clean, complete, ready to cook"
3. **Cook Mode** — "Step-by-step, timers built in"
4. **Library** — "Your recipes, finally organized"
5. **Discover** — "Find it. Save it. Cook it."
6. **All recipes/search** — "Search your whole collection"
7. **Grocery + This Week's Meals** — "Recipe to grocery list in a tap"

Creator names/handles are scrubbed throughout. Positioning note: competitors
must never be NAMED in metadata (Guideline 2.3.10) — differentiation is said
through capabilities (video-spoken extraction, link-in-bio recovery,
share-and-stay + push), which the promo text and description lead with.

The subscription products already have their review screenshot uploaded
(padded 1290×2796) — nothing more needed there.

## 8. Submission-day checklist (in order)

1. [ ] **Server flag: turn `DISCOVER_SEARCH_NATIVE` OFF** in Netlify env (Claude does this — native app must show browser-mode Discover during review; web keeps `DISCOVER_SEARCH_ENABLED=true`).
2. [ ] Final Codemagic build (carries cook mode, entitlement fix, onboarding polish) → wait for TestFlight processing → smoke-test on phone.
3. [ ] In App Store Connect → the version page: select that build.
4. [ ] Same page → **In-App Purchases and Subscriptions** section → **add BOTH** `dilla_pro_monthly` and `dilla_pro_yearly` (this is what activates the first subscription group).
5. [ ] Upload screenshots; paste description/promo/keywords from this doc.
6. [ ] App Privacy answers from §5 (one-time).
7. [ ] Age rating questionnaire (§1 — Unrestricted Web Access: Yes).
8. [ ] Demo account created + seeded + creds entered (§6); review notes pasted.
9. [ ] If ASC asks about EU Digital Services Act trader status: answering "not a trader" limits EU availability; answering trader requires publishing a contact address in the EU storefront. Either is fine to start — pick and move on.
10. [ ] Submit for review.

## 9. After approval

- Flip `DISCOVER_SEARCH_NATIVE=true` (Claude) — native result cards go live server-side, no app update.
- Verify the paywall shows real prices on the App Store build; do one real purchase + "Restore Purchases" sanity check.
- Watch the RevenueCat webhook flip the account to pro (Settings shows 200/mo).
- Consider retaking the subscription review screenshot with live prices for the next metadata update (optional).
