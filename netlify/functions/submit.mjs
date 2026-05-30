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
import { extractReel, extractWebPage } from './_lib/extract.mjs'
import { rehostImage } from './_lib/images.mjs'

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
      notes: r.notes ?? r.notes_for_user ?? null,
    },
  }
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
        const cover = await rehostImage(supabase, res.imageUrl, r.title || 'reel')
        const record = toRecord(r, { url: link, sourcePlatform: 'instagram', sourceKind: 'caption', imageUrl: cover || res.imageUrl, model: res.model })
        const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
        if (error) throw error
        return json({ ok: true, status: 'saved', kind: 'caption', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
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
      // Route by where Claude says the recipe lives: a blog/bio link -> link_in_bio recovery;
      // otherwise it's demonstrated in the video itself -> video (Apify) path.
      const kind = r.where_is_recipe === 'external_link' || r.external_url ? 'link_in_bio' : 'video'
      const meta =
        kind === 'link_in_bio'
          ? { title: r.title ?? null, author: r.source_author ?? null, externalUrl: r.external_url ?? null }
          : {}
      const { data, error } = await supabase.from('recipe_jobs').insert({ url: link, kind, meta }).select('id').single()
      if (error) throw error
      const message =
        kind === 'link_in_bio'
          ? 'Queued — pulling the full recipe from the creator’s blog. It’ll appear in your library shortly.'
          : 'Queued — the recipe is in the video. It’ll process the next time your local worker runs.'
      return json({ ok: true, status: 'queued', kind, job_id: data.id, message })
    }

    // Generic web URL (recipe blog, Pinterest-resolved link, etc.) — fast path, save directly.
    const res = await extractWebPage({ url: link, apiKey })
    if (res.recipe.found) {
      const cover = await rehostImage(supabase, res.imageUrl, res.recipe.title || 'recipe')
      const record = toRecord(res.recipe, { url: link, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover || res.imageUrl, model: res.model })
      const { data, error } = await supabase.from('recipe_recipes').insert(record).select('id').single()
      if (error) throw error
      return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
    }
    return json({ ok: false, status: 'no_recipe', message: 'Couldn’t find a recipe at that link.' })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Something went wrong.' }, 502)
  }
}
