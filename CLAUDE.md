# Recipe Vault — project context (for Claude & humans)

Personal recipe vault that pulls recipes from **Instagram reels, recipe websites, and (planned) Pinterest** into one organized, searchable library. Single user, iPhone-first (installable PWA; iOS share Shortcut planned).

- **Live app:** https://recipe-vault-mh.netlify.app
- **Repo:** https://github.com/mitchellhartjes-boop/recipe-app (public)
- **Working style:** Claude drives (writes code + deploys); the owner reviews. Dev machine is **Windows / PowerShell**.

---

## Status (2026-05-29): MVP live — all four ingestion paths working

| Input | How it's extracted | Where it runs | Latency / availability |
|---|---|---|---|
| **Instagram caption** | Fetch `/embed/captioned/` with a **Googlebot UA** → Claude Haiku → structured recipe | Netlify function (serverless) | Instant, always-on |
| **Recipe website / Pinterest link** | Fetch page → JSON-LD + visible text → Claude Haiku | Netlify function (serverless) | Instant, always-on |
| **Link-in-bio reel** (recipe on creator's blog) | Claude **`web_search`** finds the creator's blog → extracts recipe | GitHub Actions worker | ~5 min, always-on |
| **Video-only reel** (recipe spoken/on-screen) | `yt-dlp` download → `ffmpeg` audio+frames → **Groq Whisper** transcript + **Claude Sonnet vision** | **LOCAL worker only** | When the user's PC is running |

**Why video is local-only:** Instagram blocks video downloads (`yt-dlp`) from **datacenter IPs** (cloud/GitHub) — "rate-limit / login required". Captions and link-in-bio read fine from cloud IPs; only video download is blocked. The user's home (residential) IP is not blocked. **Decision: video runs on the local worker for now; "real-time video without the user's PC" is the top infra item in BACKLOG.md.**

---

## Architecture

**Frontend** — React 19 + Vite 8 + TypeScript + Tailwind 3 + react-router 7 + `vite-plugin-pwa`. Deployed to **Netlify**. Auth = Supabase email+password (email confirmation is OFF). Pages: Library (with live job cards), AddRecipe, ReviewRecipe (edit + save), RecipeDetail.

**Serverless extraction** — `netlify/functions/extract.mjs` handles the FAST paths (caption + website) synchronously and returns a draft for the review screen. Core logic in `netlify/functions/_lib/extract.mjs` (`fetchCaption`, `extractRecipeFromText`, `extractReel`, `extractWebPage`, `recoverFromWeb`).

**Share-to-app** — `netlify/functions/submit.mjs` is the **iOS Shortcut** endpoint: `POST { url }` gated by a `SHORTCUT_TOKEN` bearer header. It reuses the same extractors but **saves directly** (the phone share flow has no review screen): fast paths (caption/website) insert a `status:'saved'` recipe, slow paths (link-in-bio/video) enqueue a `recipe_jobs` row. It signs in as the app user (`APP_EMAIL`/`APP_PASSWORD`) so RLS + the `auth.uid()` column defaults scope the rows — same mechanism as the worker. Build/usage guide: `docs/ios-shortcut.md`.

**Database / realtime** — Supabase project `jftsgeerivttpvqiqjnj` (shared with the owner's other "food/health tracker" app; our tables are `recipe_*`-prefixed). Tables:
- `recipe_recipes` — the library. jsonb `ingredients`/`steps`, `text[]` tags, RLS scoped to `auth.uid()`, status `draft|saved`.
- `recipe_jobs` — async queue. `kind` (`link_in_bio`|`video`), `status` (`queued|processing|done|failed`), `meta` jsonb, `recipe_id`. RLS per-user.
- Realtime is enabled on both tables (the Library subscribes for live updates).

**Async worker** — `worker/index.mjs` (+ `worker/lib/video.mjs`). Signs in as the user, polls `recipe_jobs`, processes, writes the recipe, marks the job done. Two deployments of the SAME code, split by `WORKER_KINDS`:
- **Cloud (always-on):** GitHub Actions `.github/workflows/worker.yml` — cron `*/5` + manual dispatch, `WORKER_KINDS=link_in_bio`.
- **Local (video):** the user runs it on their PC with `WORKER_KINDS=video` (residential IP).
- `WORKER_RUN_ONCE=1` drains the queue and exits (used by the Action and for tests).

**AI / tools** — Anthropic: Haiku 4.5 for caption/web extraction; Sonnet 4.6 for video vision + link-in-bio web_search. Groq `whisper-large-v3-turbo` for audio. `yt-dlp` + `ffmpeg` (local: `tools/`; cloud: installed on the runner). Rough cost: caption ~0.3¢, website ~0.5¢, video ~3–8¢, link-in-bio ~33¢ (web search). All trivial at personal volume.

**End-to-end flow:** Add page → `POST /.netlify/functions/extract`. If a recipe is found (caption/web) → review screen → save to `recipe_recipes`. If `link_in_bio`/`video_only` → `createJob()` inserts into `recipe_jobs` → a worker processes it → it appears in the Library live.

---

## Repo layout (key files)

```
src/                      React app (pages/, lib/ {supabase, auth, api, types})
netlify/functions/
  extract.mjs             serverless extract endpoint (caption + website) -> draft for review
  submit.mjs              iOS Shortcut share-to-app endpoint (token-gated; saves/enqueues directly)
  _lib/extract.mjs        shared extraction core (also used by the worker)
docs/ios-shortcut.md      how to build + use the iOS share Shortcut
worker/
  index.mjs               queue-draining worker (cloud + local)
  lib/video.mjs           yt-dlp → ffmpeg → Groq + Claude vision
.github/workflows/worker.yml   cloud worker (GitHub Actions, link_in_bio)
scripts/                  one-off test/queue harnesses (test-extract, test-video, test-linkbio, queue-test, ...)
netlify.toml              build + SPA redirect + functions dir
tools/                    (gitignored) yt-dlp.exe, ffmpeg.exe, gh/bin/gh.exe
.env / .env.local         (gitignored) secrets + Supabase client vars
```

---

## Run & deploy (runbook)

> Windows note: `npm` is blocked in the user's interactive PowerShell (script execution policy) — use **`npm.cmd`**. `node`/`netlify`/`gh` `.exe`/`.cmd` invocations are fine. No `&&` chaining in PowerShell; use `;`.

- **Frontend only (no functions):** `npm.cmd run dev` → localhost:5173. The `/.netlify/functions/*` calls won't work here.
- **Full local (frontend + functions):** `netlify dev` (netlify-cli is installed globally; reads `.env`).
- **Build:** `npm.cmd run build`.
- **Deploy to Netlify (manual — Netlify is NOT auto-connected to the repo):**
  ```
  npm.cmd run build
  netlify deploy --prod --dir dist --functions netlify/functions --site ff4ffb6a-8b1d-4e70-93d5-ab5590a9b548
  ```
  (Env vars already set on the Netlify site: `ANTHROPIC_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and — for the `submit` endpoint — `SHORTCUT_TOKEN`, `APP_EMAIL`, `APP_PASSWORD`.)
- **Local video worker:** from `recipe-app/`:
  ```
  $env:WORKER_KINDS='video'; node worker/index.mjs
  ```
  (Loads `.env`+`.env.local` via dotenv; needs `tools/yt-dlp.exe` + `tools/ffmpeg.exe`.)
- **Cloud worker (link-in-bio):** automatic every ~5 min via GitHub Actions; manual run: `gh workflow run worker.yml --repo mitchellhartjes-boop/recipe-app` (portable gh at `tools/gh/bin/gh.exe`).

---

## Credentials & config (values are NOT in this repo)

- `.env` (gitignored): `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `APP_EMAIL`, `APP_PASSWORD` (the worker signs in as this app user).
- `.env.local` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable = safe in the client).
- **Netlify site env:** `ANTHROPIC_API_KEY`, the two `VITE_SUPABASE_*`, plus `SHORTCUT_TOKEN`, `APP_EMAIL`, `APP_PASSWORD` (the last three power the `submit` share-to-app endpoint).
- `SHORTCUT_TOKEN` (gitignored `.env` + Netlify): the bearer secret the iOS Shortcut sends. The public repo must never contain its value — `docs/ios-shortcut.md` uses a placeholder.
- **GitHub Actions secrets:** all six of the above.
- **Supabase:** project `jftsgeerivttpvqiqjnj`, URL `https://jftsgeerivttpvqiqjnj.supabase.co`. (MCP connected in past sessions.)
- ⚠️ **Rotate-me:** the Anthropic key, Groq key, app password, and the GitHub PAT all passed through chat during setup — rotate them when convenient.

---

## Gotchas / hard-won lessons

- **Instagram + datacenter IPs:** video `yt-dlp` downloads are blocked from cloud IPs (needs residential IP, i.e. local worker, or login cookies/proxy). Caption embed works from anywhere **only with a crawler (Googlebot) User-Agent** — a normal browser UA gets a JS-only shell with no caption in the HTML.
- **`web_fetch_20260209` server tool 500s** in this setup — link-in-bio recovery uses **`web_search` only** (its dynamic filtering already pulls page content). Web tools need Sonnet/Opus, not Haiku.
- **Netlify sync functions ~10–26s cap** → slow paths (link-in-bio web_search ~60-100s, video) must be async (the worker), not in the function.
- **Supabase shared project:** keep everything `recipe_`-prefixed; the `recipe_set_updated_at` trigger fn has `search_path=''` set. The owner's OTHER tables (food_logs, etc.) have permissive `USING(true)` RLS — a pre-existing issue in their other app, not ours; don't touch.
- **Node `--env-file` was flaky here** — the worker uses `dotenv` instead.

---

## Backlog

See **BACKLOG.md**. Current priority order: 1) ✅ async worker (done), 2) ✅ iOS Shortcut (done — `submit.mjs` + `docs/ios-shortcut.md`), 3) **Pinterest (next)**, 4) website hardening, 5) polish/design. Plus the standing infra upgrade: **real-time video without the user's PC** (residential proxy / cookies / always-on home device).
