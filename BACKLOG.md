# Recipe Vault — backlog

See `CLAUDE.md` for architecture/runbook. **Ingestion + infra are done; the active focus is design.**

## 🎨 Active focus: design / polish

Start from **[`docs/DESIGN.md`](docs/DESIGN.md)** (palette, current screens, goals, how to run the
frontend). High-value design work, roughly in priority order — confirm/refine with the owner:

1. **Recipe detail → a real cooking view** (highest daily value): tap-to-check ingredients, servings
   scaler (structured `ingredients` have `quantity`/`unit`), bigger step UI / step-by-step "cook
   mode", keep-screen-awake, star rating (schema has `rating 1–5`), "add to shopping list."
2. **Library upgrades:** search, tag/category filter chips, a Favorites view, sorting/sections,
   nicer cards, real empty/loading states.
3. **Mobile-first / PWA shell:** bottom tab nav, safe-area insets, transitions, install/splash polish
   (it lives on the iPhone home screen).
4. **Add/Review flow:** friendlier "extracting…" state, success feedback, cleaner review form.
5. **Identity & micro-delight:** consistent type/spacing scale, considered states, subtle motion,
   maybe a day/evening (light/dark) mode.

## Engineering nice-to-haves (not blocking)

- **Website-extractor hardening** — now the primary path for link-in-bio + Pinterest. Handle sites
  without JSON-LD, paywalls, consent walls, odd markup. Add real-world test URLs to `scripts/`.
- **Cover speed:** caption covers are deferred ~1–2 min (Apify via the GitHub worker). Could move the
  cover fetch to a Netlify **background function** (faster; skips the worker's npm-ci + ffmpeg-install).
- Connect Netlify to the repo for auto-deploy on push (deploys are currently manual via netlify-cli).
- **Rotate the secrets** that passed through chat during setup: Anthropic key, Groq key, app password,
  GitHub PAT (also in Supabase Vault `github_dispatch_token`), Apify token.
- Tune video vision to Haiku to cut cost if quality holds (the transcript carries most of the recipe).
- Atomic job claiming (`UPDATE ... WHERE status='queued'`) if ever running overlapping workers.
- Remove Vite scaffold leftovers (`src/App.css`, unused assets).

## Known limit: audience-restricted reels

~1 in 6 reels are audience-restricted ("can't be seen by certain audiences"). **No third party can
read these** — embed, yt-dlp, and Apify all fail (`restricted_page`) because the restriction is
per-viewer. They show a clear "can't read, it's restricted" message. The only fix is the owner's *own*
logged-in session (a manual `cookies.txt` export → local worker; fragile, PC-dependent, small
account-flag risk). Revisit only if these pile up; otherwise add them by hand.

## ✅ Shipped

- **All ingestion paths:** IG caption (instant), recipe website (instant), video/audio reel (Apify →
  cloud worker, always-on, no PC), link-in-bio + Pinterest (via the website path — share the blog URL).
- **iOS share Shortcut** (`submit.mjs`, token-gated) — build guide in `docs/ios-shortcut.md`.
- **Permanent cover images** re-hosted to Supabase Storage; reel covers use Apify's clean,
  play-button-free `displayUrl`; missing covers self-heal via background `cover` jobs.
- **On-demand worker** — a `recipe_jobs` insert trigger dispatches the GitHub workflow via `pg_net`
  (runs in ~1–2 min, not the flaky `*/5` cron).
- **Retired** the ~30¢ Claude `web_search` link-in-bio recovery in favor of the cheap website path.
