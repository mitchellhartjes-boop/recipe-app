# Recipe Vault — design brief

This is the starting doc for the **design/polish** phase. The app is **functionally complete** (every
ingestion path works, images, auth, on-demand processing). Read `CLAUDE.md` for the architecture; this
file is about how it *looks and feels* and where to take it.

## What this app is (the vibe)

A **personal** recipe vault — single user, **iPhone-first** (installed as a PWA from the home screen).
The owner saves recipes by sharing Instagram reels / web links via an iOS Shortcut, then cooks from
them. So the two moments that matter most are **(1) browsing the library** and **(2) cooking from a
recipe on a phone propped up in the kitchen**. It should feel warm, editorial, and calm — like a
well-kept personal cookbook, not a busy SaaS app. **The owner's taste bar is high** — polish is part of
the deliverable, not an afterthought; avoid bland/generic/raw output.

## Current design system (already in place)

Tailwind 3 (`tailwind.config.js`), no component library. Tokens:

- **Colors:** `cream` `#faf8f5` (app bg), `paper` `#fffdfa` (cards), `ink` `#292524` (text),
  **`paprika`** 50–900 (warm orange-red accent, primary = `paprika-700` `#c2410c`). Grays via Tailwind
  `stone-*`.
- **Fonts** (loaded in `index.html`): **Fraunces** (`font-display`, serif) for headings;
  **Inter** (`font-sans`) for body.
- **Shadow:** custom soft `shadow-card`. Rounded corners are generous (`rounded-2xl` on cards).
- **Logo/favicon:** a "bowl-mark" SVG (`public/favicon.svg`).

Keep this palette/type as the foundation — it's good. Evolve/extend it; don't throw it out.

## Current screens (what exists today)

All in `src/pages/` + `src/components/Layout.tsx`:

- **Layout** — sticky top header (bowl logo + "Recipe Vault" wordmark, "+ Add recipe" button, "Sign
  out"), centered `max-w-5xl`, cream bg. *Desktop-style header even though the app is iPhone-first —
  no mobile bottom nav yet.*
- **Library** (`Library.tsx`) — responsive grid of recipe cards (cover image, title, author);
  live "processing" job cards with a spinner; a basic empty state. *No search, filters, favorites
  view, sorting, or sections yet.*
- **RecipeDetail** (`RecipeDetail.tsx`) — image hero, title + favorite star, times/servings + source
  link, tag chips, two-column ingredients/steps, notes, delete. *Functional but flat: no ingredient
  check-off, no step-by-step "cook mode", no recipe scaling, no rating UI (schema has `rating 1–5`),
  no shopping-list action.*
- **AddRecipe** (`AddRecipe.tsx`) — single URL input + Extract button, with busy/error text.
- **ReviewRecipe** (`ReviewRecipe.tsx`) — long edit form (title, description, servings, prep/cook,
  editable ingredient/step lists, tags, notes) before saving.
- **Login** (`Login.tsx`) — email/password.

Data model the UI has to work with (`src/lib/types.ts`): `title, description, source_platform,
source_url, source_author, image_url, servings, prep/cook/total_minutes, ingredients[{raw,quantity,
unit,item}], steps[], tags[], notes, rating, favorite, status`.

## Design goals / direction (the north star)

1. **A beautiful library** worth opening for fun — strong cards, a sense of collection, easy to find
   things (search + tag/category filters + favorites). Consider sections (recently added, favorites,
   by tag/cuisine).
2. **A great cooking experience** on `RecipeDetail` — the screen you actually use at the stove:
   tap-to-check ingredients, big readable steps / a focused step-by-step mode, keep-screen-awake,
   servings scaler (the structured `ingredients` support `quantity`/`unit`), star rating, "add to
   shopping list."
3. **Mobile-first / PWA-native feel** — it lives on a home screen. Bottom tab bar instead of (or in
   addition to) the top header, generous touch targets, respect safe-area insets, smooth transitions,
   a polished install/splash. Make `localhost` look great at iPhone width first, desktop second.
4. **Cohesive identity & micro-delight** — consistent spacing/typographic scale, considered
   empty/loading/error states (not just gray text), subtle motion, maybe a light/dark or day/evening
   mode. Lean into the warm "cookbook" feeling.

## Suggested first moves (prioritized — refine with the owner)

1. **Recipe detail → real cooking view** (highest daily value): checkable ingredients, servings
   scaler, larger step UI / cook mode, rating, screen-wake. 
2. **Library upgrades:** search, tag filter chips, a Favorites view, nicer cards + empty/loading states.
3. **Mobile shell:** bottom nav, safe areas, transitions, install polish.
4. **Add/Review flow polish:** a friendlier extracting state, success animation, cleaner review form.

## How to iterate (design loop)

- **Run the frontend only:** `npm.cmd run dev` → http://localhost:5173 (Windows/PowerShell — use
  `npm.cmd`, not `npm`). It talks to the **live Supabase**, so you get the owner's real recipes. Log
  in with the app account (`APP_EMAIL`/`APP_PASSWORD` in `.env`). You do **not** need the Netlify
  functions or the worker running for design work.
- Use the **Preview** tooling (preview_start / preview_screenshot / preview_resize) to render at iPhone
  widths and screenshot for review.
- **Deploy when ready:** `npm.cmd run build` then `netlify deploy --prod --dir dist --functions
  netlify/functions --site ff4ffb6a-8b1d-4e70-93d5-ab5590a9b548` (see `CLAUDE.md` runbook).
- Pure design changes are frontend-only (`src/**`, `tailwind.config.js`, `index.html`); the backend in
  `CLAUDE.md` shouldn't need touching.
