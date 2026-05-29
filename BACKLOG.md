# Recipe Vault — backlog

Priority order set by the owner. See CLAUDE.md for architecture/runbook.

## Next up

### 1. iOS Shortcut (share-to-app) — owner priority #2
Share a reel from Instagram on the phone → it lands in the queue/library without opening the site.
- Build a small `submit` endpoint (Netlify function) that accepts a shared URL + authenticates the user, then either extracts (caption/web) or enqueues a job (link_in_bio/video) — server-side, so the Shortcut stays simple.
- Provide the iOS Shortcut recipe (Share Sheet action → "Get Contents of URL" POST → confirmation).
- Auth from the Shortcut: simplest is a per-user token/secret the Shortcut sends; decide the mechanism.

### 2. Pinterest support — owner priority #3
Pins usually link to a source recipe site (→ reuse the website path) or hold the recipe in the pin description/image (→ fetch + Claude, OCR if needed). Add a Pinterest branch to `extract.mjs`.

### 3. Website extraction hardening — owner priority #4
The web path works (JSON-LD + text → Claude). Harden for sites without JSON-LD, paywalls, consent walls, and odd markup. Add a few real-world test URLs to `scripts/`.

### 4. Polish / design — owner priority #5
- **Capture thumbnails for caption recipes** (currently `image_url` is null for IG caption extracts → cards show a placeholder). Pull the reel thumbnail (yt-dlp metadata or the embed) on the worker/serverless side.
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
