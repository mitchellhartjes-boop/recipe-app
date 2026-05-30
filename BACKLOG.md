# Recipe Vault — backlog

Priority order set by the owner. See CLAUDE.md for architecture/runbook.

## Done

### ✅ iOS Shortcut (share-to-app) — owner priority #2
Share a reel from Instagram on the phone → it lands in the queue/library without opening the site.
- **`netlify/functions/submit.mjs`** — token-gated (`SHORTCUT_TOKEN` bearer) endpoint. Accepts a shared URL (also tolerates a link buried in shared text, raw-text body, or `?url=`/`?token=`), signs in as the app user (`APP_EMAIL`/`APP_PASSWORD`) so RLS scopes the rows, then **saves directly** (no review screen): caption/website → `status:'saved'` recipe; link_in_bio/video → `recipe_jobs` row. Returns a friendly `message` for the Shortcut to display.
- **Auth mechanism chosen:** a shared bearer token (`SHORTCUT_TOKEN`), set in gitignored `.env` + on the Netlify site. Simpler than per-request Supabase auth and keeps the Shortcut trivial. (No service-role key — keeps the blast radius to what the app user can do via RLS.)
- **Shortcut recipe:** see `docs/ios-shortcut.md` (Share Sheet → Get Contents of URL POST → Show Notification). Build guide uses a placeholder token since the repo is public.
- Verified live end-to-end: 401 on bad token, 400 on no URL, caption + website both saved and RLS-scoped (test rows cleaned up). IG caption fetch confirmed working from Netlify for this function too.
- Possible follow-ups: generate a one-tap importable `.shortcut` file; handle Instagram `/share/…` redirect URLs (resolve before `parseShortcode`).

## Next up

### 1. Pinterest support — owner priority #3
Pins usually link to a source recipe site (→ reuse the website path) or hold the recipe in the pin description/image (→ fetch + Claude, OCR if needed). Add a Pinterest branch to `extract.mjs`.

### 2. Website extraction hardening — owner priority #4
The web path works (JSON-LD + text → Claude). Harden for sites without JSON-LD, paywalls, consent walls, and odd markup. Add a few real-world test URLs to `scripts/`.

### 3. Polish / design — owner priority #5
- ✅ **Recipe cover images (done).** Every path captures a cover and re-hosts it to Supabase Storage (`recipe-images`) so it never expires: IG caption/reel cover from the embed, website + link-in-bio `og:image`, video reel via the yt-dlp thumbnail. Helper `netlify/functions/_lib/images.mjs`; `scripts/backfill-images.mjs` fills existing rows.
- Search + tag filtering in the Library; favorites view.
- Recipe scaling (2×), shopping-list generation (the structured `ingredients` already support this).
- Empty/loading/error-state polish; mobile spacing; the review screen UX.

## Standing infra upgrade

### ★ Real-time video without the owner's PC running
Today, video-only reels process only when the local worker runs (Instagram blocks video downloads from datacenter IPs, so the cloud worker can't do them). Goal: always-on video like the other paths. Options to evaluate:
- **Residential/mobile proxy** for `yt-dlp` from the cloud worker (most robust; small monthly cost). Likely the real answer.
- **Instagram login cookies** fed to `yt-dlp` in the cloud worker (free-ish, but cookies expire and using the main account from a datacenter IP risks an IG flag/lock — use a throwaway IG account if pursued).
- **Always-on home device** (e.g., a Raspberry Pi / mini PC) running the local worker on a residential IP — free-ish, no account risk.
- Re-test periodically; Instagram's behavior changes.

## Ops / cleanup (nice-to-have)
- Connect Netlify to the GitHub repo for auto-deploy on push (currently deploys are manual via netlify-cli).
- Rotate the secrets that passed through chat (Anthropic, Groq, app password, GitHub PAT).
- Tune the video vision model to Haiku to cut cost if quality holds (transcript carries most of the recipe).
- Atomic job claiming (conditional `UPDATE ... WHERE status='queued'`) if ever running multiple overlapping workers on the same kinds.
- Remove Vite scaffold leftovers (`src/App.css`, unused assets).
