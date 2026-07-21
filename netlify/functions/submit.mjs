// Share-to-app endpoint for the iOS Shortcut (and any token-holding client).
// One shared URL in -> recipe saved to the library, or a job queued for the worker.
//
// POST /.netlify/functions/submit
//   auth:  Authorization: Bearer <SHORTCUT_TOKEN>   (or X-Shortcut-Token header, or ?token=)
//   body:  { "url": "https://www.instagram.com/reel/..." }   (also accepts raw text / ?url=)
//   ->     { ok, status: 'saved'|'queued'|'no_recipe', kind, recipe_id?|job_id?, title?, message }
//
// Unlike /extract (which returns a draft for the on-screen review step), this saves directly:
// the phone share flow has no review screen. Fast paths (Instagram caption, recipe website) are
// extracted + saved synchronously; slow paths (link-in-bio web_search, video) are enqueued for
// the worker, exactly like the web app's createJob(). The recipe is owned by the app user — the
// function signs in with APP_EMAIL/APP_PASSWORD so Supabase RLS + the `auth.uid()` column
// defaults scope the row correctly (same mechanism as worker/index.mjs).
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { extractReel, extractWebPage, extractRecipeFromImage } from './_lib/extract.mjs'
import { coverImage } from './_lib/images.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Shortcut-Token',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

const isInstagram = (url) => /instagram\.com\//i.test(url)

// Pull the first http(s) URL out of whatever the share sheet handed us (it may be
// "Check this out: https://…" rather than a bare URL). Trim trailing punctuation.
function firstUrl(input) {
  if (typeof input !== 'string') return null
  const m = input.match(/https?:\/\/[^\s"'<>]+/i)
  if (!m) return null
  return m[0].replace(/[.,)\]}'"]+$/, '')
}

// Constant-time token compare (hash first so lengths never differ / leak).
function tokenMatches(provided, expected) {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(String(provided)).digest()
  const b = createHash('sha256').update(String(expected)).digest()
  return timingSafeEqual(a, b)
}

function getToken(req, body, urlObj) {
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  if (bearer) return bearer[1].trim()
  const header = req.headers.get('x-shortcut-token')
  if (header) return header.trim()
  if (body && typeof body.token === 'string') return body.token.trim()
  const q = urlObj.searchParams.get('token')
  return q ? q.trim() : null
}

// Sign in as the app user so RLS-scoped inserts land under the right user_id.
async function signedInClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  const email = process.env.APP_EMAIL
  const password = process.env.APP_PASSWORD
  if (!url || !key) throw new Error('Server is missing Supabase config')
  if (!email || !password) throw new Error('Server is missing APP_EMAIL / APP_PASSWORD')
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Supabase sign-in failed: ${error.message}`)
  return supabase
}

// Normalize an extractor recipe into a recipe_recipes row (status 'saved' = shows in the library).
function toRecord(r, { url, sourcePlatform, sourceKind, imageUrl, model }) {
  return {
    title: r.title || 'Untitled recipe',
    description: r.description ?? null,
    source_platform: sourcePlatform,
    source_url: r.source_url ?? url,
    source_author: r.source_author ?? null,
    image_url: r.image_url ?? imageUrl ?? null,
    servings: r.servings ?? null,
    prep_minutes: r.prep_minutes ?? null,
    cook_minutes: r.cook_minutes ?? null,
    total_minutes: r.total_minutes ?? null,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes ?? null,
    status: 'saved',
    extraction_meta: {
      source_kind: sourceKind,
      model: model ?? null,
      confidence: r.confidence ?? null,
      via: 'ios_shortcut',
      photo_query: r.photo_query ?? null,
      notes: r.notes ?? r.notes_for_user ?? null,
    },
  }
}

// Pull a base64 image + media type out of the request body, accepting the shapes
// an iOS Shortcut can send: a data: URL, a bare base64 string, or {image, type}.
function getImage(body, urlObj) {
  let raw = null
  let type = 'image/jpeg'
  if (body && typeof body === 'object') {
    raw = body.image ?? body.photo ?? body.image_base64 ?? body.file ?? null
    if (typeof body.type === 'string') type = body.type
    if (typeof body.media_type === 'string') type = body.media_type
  }
  if (!raw && urlObj.searchParams.get('image')) raw = urlObj.searchParams.get('image')
  if (!raw || typeof raw !== 'string') return null
  const m = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is)
  if (m) return { base64: m[2].replace(/\s/g, ''), mediaType: m[1].toLowerCase() }
  const cleaned = raw.replace(/\s/g, '')
  // Heuristic: real base64 image payloads are large; ignore tiny/garbage strings.
  if (cleaned.length < 100 || /[^A-Za-z0-9+/=]/.test(cleaned.slice(0, 64))) return null
  return { base64: cleaned, mediaType: type.toLowerCase() }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405)

  const urlObj = new URL(req.url)

  // Body may be JSON ({url|text|token}) or raw text (a pasted/shared URL).
  let body = null
  let rawText = ''
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      rawText = await req.text()
      try {
        body = JSON.parse(rawText)
      } catch {
        /* not JSON — treat rawText as the shared URL */
      }
    }
  } catch {
    /* tolerate empty/garbled bodies; auth + url checks below handle it */
  }

  // --- auth ---
  const expected = process.env.SHORTCUT_TOKEN
  if (!expected) return json({ ok: false, message: 'Server is missing SHORTCUT_TOKEN' }, 500)
  if (!tokenMatches(getToken(req, body, urlObj), expected)) {
    return json({ ok: false, message: 'Unauthorized — check the token in your Shortcut.' }, 401)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, message: 'Server is missing ANTHROPIC_API_KEY' }, 500)

  // --- screenshot / photo path (no URL) ---
  // The way to capture audience-restricted or age-gated reels (e.g. cocktails):
  // the user screenshots what they can already see and shares the image. Claude
  // vision reads the recipe; the screenshot is NOT used as the cover (it's full
  // of app chrome) — we fetch a clean stock photo from photo_query instead.
  const img = getImage(body, urlObj)
  if (img) {
    try {
      const supabase = await signedInClient()
      const { recipe: r, model } = await extractRecipeFromImage({ base64: img.base64, mediaType: img.mediaType, apiKey })
      if (!r.found) {
        return json({
          ok: false,
          status: 'no_recipe',
          kind: 'image',
          message: r.notes_for_user || "Couldn't find a recipe in that screenshot. Make sure the ingredients and steps are visible.",
        })
      }
      const cover = await coverImage(supabase, { srcUrl: null, photoQuery: r.photo_query, keyHint: r.title || 'recipe' })
      const record = toRecord(r, { url: null, sourcePlatform: 'instagram', sourceKind: 'screenshot', imageUrl: cover, model })
      const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
      if (error) throw error
      return json({ ok: true, status: 'saved', kind: 'screenshot', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” from your screenshot.` })
    } catch (e) {
      return json({ ok: false, message: e?.message || 'Could not read the screenshot.' }, 502)
    }
  }

  // --- resolve the shared URL ---
  const rawInput =
    (body && (body.url ?? body.text ?? body.shared)) || rawText || urlObj.searchParams.get('url') || ''
  const link = firstUrl(rawInput) || (typeof rawInput === 'string' ? rawInput.trim() : '')
  if (!link || !/^https?:\/\//i.test(link)) {
    return json({ ok: false, message: 'No valid link was shared.' }, 400)
  }

  try {
    const supabase = await signedInClient()

    if (isInstagram(link)) {
      const res = await extractReel(link, { apiKey })
      const r = res.recipe
      if (r.found) {
        // Skip the embed's lookaside cover — it carries Instagram's play-button overlay. Save
        // without an image, then a 'cover' job pulls Apify's clean, higher-res cover and fills it
        // in live (~1-2 min via the on-demand worker).
        const record = toRecord(r, { url: link, sourcePlatform: 'instagram', sourceKind: 'caption', imageUrl: null, model: res.model })
        const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
        if (error) throw error
        await supabase.from('recipe_jobs').insert({ url: link, kind: 'cover', meta: { recipe_id: data.id } })
        return json({ ok: true, status: 'saved', kind: 'caption', recipe_id: data.id, title: record.title, image_url: null, message: `Saved “${record.title}” to your library.` })
      }
      // Couldn't read the reel at all (private / audience-restricted / removed). Don't queue a
      // job that will only fail later on the worker — tell the user right away.
      if (res.inaccessible) {
        return json({
          ok: false,
          status: 'inaccessible',
          kind: 'instagram',
          message:
            "Couldn't read this reel — it looks private or audience-restricted, so Instagram only shows it to logged-in viewers. The app can't read it automatically.",
        })
      }
      // Recipe is on the creator's blog, not in the caption. If the blog link is right there in
      // the caption, fetch it now via the cheap+instant website path. (We no longer run the slow,
      // expensive Claude web_search recovery — the user shares the blog link directly instead.)
      if (r.where_is_recipe === 'external_link' || r.external_url) {
        if (r.external_url) {
          const web = await extractWebPage({ url: r.external_url, apiKey })
          if (web.recipe.found) {
            const cover = await coverImage(supabase, { srcUrl: web.imageUrl, photoQuery: web.recipe.photo_query, keyHint: web.recipe.title || r.title || 'recipe' })
            const record = toRecord(web.recipe, { url: r.external_url, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover, model: web.model })
            const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
            if (error) throw error
            return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
          }
        }
        const who = r.source_author ? `@${r.source_author}'s` : "the creator's"
        return json({
          ok: false,
          status: 'link_in_bio',
          kind: 'instagram',
          message: `This recipe lives on ${who} blog, not in the caption. Open the link in the reel and share that web page to the app to save it.`,
        })
      }
      // Otherwise the recipe is in the video itself -> queue the video (Apify) path.
      const { data, error } = await supabase.from('recipe_jobs').insert({ url: link, kind: 'video', meta: {} }).select('id').single()
      if (error) throw error
      return json({ ok: true, status: 'queued', kind: 'video', job_id: data.id, message: 'Queued — the recipe’s in the video. It’ll appear in a minute or two.' })
    }

    // Generic web URL (recipe blog, Pinterest-resolved link, etc.) — fast path, save directly.
    const res = await extractWebPage({ url: link, apiKey })
    if (res.recipe.found) {
      const cover = await coverImage(supabase, { srcUrl: res.imageUrl, photoQuery: res.recipe.photo_query, keyHint: res.recipe.title || 'recipe' })
      const record = toRecord(res.recipe, { url: link, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover, model: res.model })
      const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
      if (error) throw error
      return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
    }
    return json({ ok: false, status: 'no_recipe', message: 'Couldn’t find a recipe at that link.' })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Something went wrong.' }, 502)
  }
}
