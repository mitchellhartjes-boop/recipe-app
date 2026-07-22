# App Store submission kit — Dilla: Recipe Vault

Everything App Store Connect will ask for, drafted and ready to paste.
Fill-in-by-Mitchell items are marked ☐.

Modelled on the Sounder kit, which is already proven on this developer account.

## Identity

- **App name (30 chars max):** `Dilla: Recipe Vault` (19)
- **Subtitle (30 chars max):** `Cook what you save` (18)
- **Bundle ID:** `com.mitchellhartjes.dilla`
- **SKU:** `dilla-ios-001`
- **Primary category:** Food & Drink · **Secondary:** Lifestyle
- **Age rating:** expect **4+**, but answer the alcohol question honestly — the
  Drinks category includes cocktails, so flag *infrequent/mild alcohol
  references*. Also disclose model-generated content (recipes are extracted by
  an LLM). Careless answers here are a metadata rejection.
- **Price:** ☐ decide — recommendation is Free with IAP (see BACKLOG/strategy),
  NOT free-with-no-IAP like Sounder: every import costs real money.
- **Privacy policy URL:** ☐ needed before submission
- **Support URL:** ☐ needed before submission

## Promotional text (170 chars, editable without review)

> Save a recipe from anywhere — a reel, a blog, a screenshot — and Dilla turns it
> into a clean recipe you can actually cook from, with a cook mode built for a
> phone on the counter.

## Description

> **You save 200 recipes. You cook four of them.**
>
> Dilla is for those four.
>
> Share a recipe from Instagram, a food blog, or a screenshot, and Dilla reads it
> and writes it out properly — every ingredient with its amount, every step in
> order, no life story, no scrolling past ads.
>
> **BUILT FOR THE COUNTER, NOT THE COUCH**
> Cook mode shows one step at a time in big readable type and keeps your screen
> awake while your hands are covered in flour. Tap ingredients off as you go.
> Pull up the ingredient list without losing your place.
>
> **THE NUMBERS ACTUALLY WORK**
> Cooking for six instead of four? Tap once and every quantity rescales —
> including the awkward ones, like ¾ cup and 350g and "1–2 cloves."
> Recipes with a sauce and a base keep them as separate lists, the way the
> recipe was written.
>
> **A COOKBOOK THAT ORGANIZES ITSELF**
> Your recipes sort themselves into Breakfast, Bread, Seafood, Pastas, Mexican,
> Asian and more — no tagging, no filing. Search across every ingredient you own.
>
> **THE REST OF THE WEEK**
> A grocery list that syncs across your devices — add a whole recipe to it and
> pick just the things you're missing. A simple five-slot planner for the week's
> dinners.
>
> **YOURS**
> Every recipe credits the creator and links back to their post. Dark mode for
> late-night cooking. Your recipes are private.

## Keywords (100 chars)

`recipe,cookbook,meal plan,grocery list,cooking,recipe saver,food,meal prep,kitchen,recipe organizer`

☐ Do not repeat words already in the app name/subtitle — Apple indexes those
separately, so "vault", "cook", "save" are wasted here.

## Screenshot plan (6.7" required set, capture in this order)

Lead with **cook mode**, not importing — importing is the crowded, commoditized
half of this category; the cooking experience is the differentiator.

1. **Cook mode, mid-recipe** — big step type, progress bar. Caption: *"Built for a phone on the counter."*
2. **Recipe detail** — checked ingredients + servings scaler mid-adjust. Caption: *"Scale it to your table."*
3. **Home category tiles** — real food photography. Caption: *"It organizes itself."*
4. **Share sheet → recipe** — the import moment. Caption: *"Any reel, blog, or screenshot."*
5. **Grocery list** — with the per-ingredient picker open. Caption: *"Only what you're missing."*
6. **Dark mode cook view.** Caption: *"Late-night cooking, sorted."*

Capture on a real device or the iPhone 17 Pro Max simulator, with a seeded,
real-looking library (not test data).

## App Privacy (nutrition label answers)

- **Data used to track you:** None
- **Data linked to you:** Contact info (email) — *App Functionality* only, for
  authentication. Not used for tracking or advertising.
- **User content:** Recipes, photos, and grocery/meal-plan data — *App
  Functionality*, stored in the user's own account.
- **Third-party AI disclosure (Guideline 5.1.2(i), effective Nov 13 2025):** the
  app sends shared content to third-party AI providers for extraction. Must be
  disclosed AND consented to before the first extraction call. Name them:
  **Anthropic (Claude)** for text/vision extraction, **Groq (Whisper)** for audio
  transcription if the video path ships.
- ☐ Build the first-run consent sheet before submitting.

## Review notes (paste into App Review Information)

> Dilla is a personal recipe organizer. Users share a link, image, or screenshot
> to the app from their own device, and the app extracts the recipe text into a
> structured format the user can cook from.
>
> The app performs no crawling, bulk collection, or automated harvesting. When a
> user shares a public link, the app makes a single fetch of that one URL, using
> its own identifying user agent (DillaBot/1.0), in direct response to that user
> action. The app does not store third-party credentials, does not download or
> retain third-party video or audio, and does not provide any means for a user to
> save or export media from a third-party service. Every saved recipe displays
> the original creator's name and a link back to the original post.
>
> Recipes are private to the user's account by default; there is no public feed
> or sharing surface.
>
> ☐ Test account: <email> / <password>

## Version 1 checklist

- ☐ Apple Developer enrollment active (shared with Sounder)
- ☐ **Trademark clearance on "Dilla"** — classes 009/042, specifically vs.
  Dillas Quesadillas (food-sector mark, food app, quesadilla-derived name).
  Cheapest insurance in the project; renaming post-launch destroys ASO + ratings.
- ☐ Push repo to GitHub
- ☐ Codemagic: connect repo, add `dilla-asc` App Store Connect key, create the
  `dilla` env group (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, CERT_KEY_B64)
- ☐ App Store Connect: create the app record (name + bundle ID above)
- ☐ First TestFlight build green
- ☐ Multi-tenancy (real per-user auth) — currently single-user
- ☐ Account deletion in-app (Guideline 5.1.1(v))
- ☐ AI consent sheet (Guideline 5.1.2(i))
- ☐ Native Share Extension (replaces the iOS Shortcut; Guideline 4.2.3(i))
- ☐ Quotas + spend circuit breaker before public signups
- ☐ Privacy policy + support URLs live
- ☐ Screenshots captured & uploaded
- ☐ Submit (expect 1–2 rejection/fix cycles as a first-timer; normal)
