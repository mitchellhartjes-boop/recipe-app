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

## Decisions

### ✅ Link-in-bio: retired the web_search recovery (2026-05-30)
The Claude `web_search` recovery was ~30¢, slow (minutes), and unreliable (timed out at ~11 min). **Replaced**: `external_link` reels now go through the website path — if the blog URL is in the caption it's fetched inline (instant, ~0.5¢); otherwise the user opens the link and shares the blog page. `recoverFromWeb` kept in the lib as a defensive capability but no longer enqueued. Owner's workflow: just share the blog link.

### ✅ Pinterest: handled via the website path (no dedicated feature needed)
Owner clicks through the pin to the source recipe site and shares that URL → website path. No Pinterest branch needed for the common case. (Edge case — recipe only in the pin image/description, no source site — would need OCR; defer until it actually comes up.)

## Next up

### 1. Website extraction hardening — owner priority
The web path works (JSON-LD + text → Claude). Now the **primary** path for link-in-bio + Pinterest too, so worth hardening: sites without JSON-LD, paywalls, consent walls, odd markup. Add a few real-world test URLs to `scripts/`.

### 3. Polish / design — owner priority #5
- ✅ **Recipe cover images (done).** Every path captures a cover and re-hosts it to Supabase Storage (`recipe-images`) so it never expires: IG caption/reel cover from the embed, website + link-in-bio `og:image`, video reel via the yt-dlp thumbnail. Helper `netlify/functions/_lib/images.mjs`; `scripts/backfill-images.mjs` fills existing rows.
- Search + tag filtering in the Library; favorites view.
- Recipe scaling (2×), shopping-list generation (the structured `ingredients` already support this).
- Empty/loading/error-state polish; mobile spacing; the review screen UX.

## Instagram access

### ✅ Always-on video without the owner's PC — DONE (via Apify)
Public video/audio reels now process on the cloud worker: **Apify** (`instagram-scraper`) returns the reel's direct CDN video URL, which the cloud worker downloads (no `yt-dlp`, no datacenter-IP block) → ffmpeg → Groq + Claude. `WORKER_KINDS=link_in_bio,video`. Free tier covers personal volume.

### ◇ Audience-restricted reels (the remaining gap)
~1 in 6 reels are audience-restricted ("can't be seen by certain audiences"). **No third party can read these** — embed, yt-dlp, and Apify all fail (`restricted_page`) because the restriction is per-viewer. They show a clear "can't read, it's restricted" message. The only fix is the owner's *own* logged-in session:
- **cookies.txt** exported from the owner's browser → fed to `yt-dlp`/Apify on the *local* worker (residential IP). Fragile (expires), PC-dependent, small account-flag risk. `--cookies-from-browser` is blocked on the owner's Windows/Chrome (App-Bound cookie encryption) — would need a manual `cookies.txt` export.
- Or just add those few by hand (paste/screenshot).
- Revisit only if restricted reels pile up in practice.

## Ops / cleanup (nice-to-have)
- Connect Netlify to the GitHub repo for auto-deploy on push (currently deploys are manual via netlify-cli).
- Rotate the secrets that passed through chat (Anthropic, Groq, app password, GitHub PAT, Apify token).
- Tune the video vision model to Haiku to cut cost if quality holds (transcript carries most of the recipe).
- The GitHub `*/5` cron is best-effort (often 15–60 min between runs). If snappier link-in-bio/video matters, move the worker off GitHub Actions cron (e.g. a small always-on host or a Netlify background function trigger).
- Atomic job claiming (conditional `UPDATE ... WHERE status='queued'`) if ever running multiple overlapping workers on the same kinds.
- Remove Vite scaffold leftovers (`src/App.css`, unused assets); the `tools/yt-dlp.exe` is now only used by the local fallback + `backfill-images.mjs`.

## Ops / cleanup (nice-to-have)
- Connect Netlify to the GitHub repo for auto-deploy on push (currently deploys are manual via netlify-cli).
- Rotate the secrets that passed through chat (Anthropic, Groq, app password, GitHub PAT).
- Tune the video vision model to Haiku to cut cost if quality holds (transcript carries most of the recipe).
- Atomic job claiming (conditional `UPDATE ... WHERE status='queued'`) if ever running multiple overlapping workers on the same kinds.
- Remove Vite scaffold leftovers (`src/App.css`, unused assets).
