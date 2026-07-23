// Share-to-app endpoint for the iOS Share Extension (and the legacy Shortcut).
// One shared URL in -> recipe saved to the library, or a job queued for the worker.
//
// POST /.netlify/functions/submit
//   auth:  Authorization: Bearer <share key>   (or X-Shortcut-Token header, or ?token=)
//   body:  { "url": "https://www.instagram.com/reel/..." }   (also accepts raw text / ?url=)
//   ->     { ok, status: 'saved'|'queued'|'no_recipe', kind, recipe_id?|job_id?, title?, message }
//
// Unlike /extract (which returns a draft for the on-screen review step), this saves directly:
// the phone share flow has no review screen. Fast paths (Instagram caption, recipe website,
// link-in-bio recovery) are extracted + saved synchronously; slow paths (video) are enqueued for
// the worker, exactly like the web app's createJob().
//
// OWNERSHIP: the bearer token is a PER-USER share key (share_keys), minted on the
// user's device and read by the extension from the App Group — so a recipe lands
// in the library of whoever shared it. resolveCaller() is the security boundary;
// insertRecipe()/insertJob() are the only places user_id is set, because under the
// service role RLS is not enforcing anything and attribution is ours to get right.
// A build-wide SHORTCUT_TOKEN is still accepted as a legacy fallback mapping to
// the owner's account, so older installs and the original Shortcut keep working.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { extractReel, extractWebPage, extractRecipeFromImage, resolvePinterestLink } from './_lib/extract.mjs'
import { recoverFromCreatorSite } from './_lib/creatorSite.mjs'
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

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// pin.it is the short link the iOS share sheet produces; the regex also covers
// the country domains (nl.pinterest.com, pinterest.co.uk) while refusing
// lookalikes like pinterestrecipes.net.
const isPinterest = (host) => !!host && (host === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/i.test(host))

// Pull the first http(s) URL out of whatever the share sheet handed us (it may be
// "Check this out: https://…" rather than a bare URL). Trim trailing punctuation.
function firstUrl(input) {
  if (typeof input !== 'string') return null
  const m = input.match(/https?:\/\/[^\s"'<>]+/i)
  if (!m) return null
  return m[0].replace(/[.,)\]}'"]+$/, '')
}

// Repair a URL the caption extractor handed back before anything tries to fetch
// it. Haiku is inconsistent about schemes — it returns "www.site.com/recipe" as
// readily as a full URL, and fetch() throws a raw TypeError on the bare form.
// Also unwraps Instagram's l.instagram.com redirector and strips tracking params.
// Returns null when the string isn't host-shaped at all.
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null
  let s = raw.trim().replace(/[.,)\]}'"]+$/, '')
  if (!s) return null

  if (/^(https?:\/\/)?l\.instagram\.com/i.test(s)) {
    try {
      const wrapped = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
      const target = wrapped.searchParams.get('u')
      if (target) s = decodeURIComponent(target)
    } catch {
      /* not parseable as a wrapper — fall through and treat it as a plain url */
    }
  }

  if (!/^https?:\/\//i.test(s)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return null // not host-shaped
    s = `https://${s}`
  }

  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|igshid|si|ref)$/i.test(key)) u.searchParams.delete(key)
    }
    return u.toString()
  } catch {
    return null
  }
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

// Service-role client. Bypasses RLS, so it is ONLY ever used with an explicitly
// resolved user_id (see insertRecipe/insertJob, the single places that set it).
// Returns null when unconfigured, which keeps the legacy single-account path
// working rather than taking every import down.
function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Work out WHO is importing. This is the security boundary of the share path:
// everything downstream writes as the user resolved here, and nothing else.
async function resolveCaller(provided) {
  const admin = adminClient()

  // Per-user share key — the path every app user takes. The key is minted on
  // their device, stored in share_keys, and read by the Share Extension from
  // the App Group, so it identifies a PERSON rather than a build.
  if (admin && provided) {
    const { data } = await admin
      .from('share_keys')
      .select('user_id, revoked_at')
      .eq('key', provided)
      .maybeSingle()
    if (data && !data.revoked_at) {
      // Not awaited: last_used_at is for pruning stale devices later, and it
      // must never delay or fail an import.
      void admin.from('share_keys').update({ last_used_at: new Date().toISOString() }).eq('key', provided)
      return { supabase: admin, userId: data.user_id, mode: 'share_key' }
    }
  }

  // Legacy build-wide token -> the owner's account. Kept so installs that
  // haven't been reopened since updating, and the original iOS Shortcut, keep
  // working through the transition. Remove once everyone has moved over.
  const legacy = process.env.SHORTCUT_TOKEN
  if (legacy && tokenMatches(provided, legacy)) {
    const owner = await signedInClient()
    const { data, error } = await owner.auth.getUser()
    if (error || !data?.user) throw new Error('Legacy owner sign-in returned no user')
    return { supabase: admin ?? owner, userId: data.user.id, mode: 'legacy' }
  }

  return null
}

// THE one place a recipe's owner is set. Every insert goes through here so that
// under the service role — where RLS is not enforcing anything — a single
// audited line decides attribution, rather than five call sites that could drift.
// user_id is set explicitly and is NEVER taken from the request body.
function insertRecipe(supabase, userId, record) {
  return supabase.from('recipe_recipes').insert({ ...record, user_id: userId }).select('id').single()
}

// Same contract for queued work, so a job the worker later completes is
// attributed to the person who shared it.
function insertJob(supabase, userId, row) {
  return supabase.from('recipe_jobs').insert({ ...row, user_id: userId }).select('id').single()
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

  // --- auth: resolve which user this import belongs to ---
  let caller
  try {
    caller = await resolveCaller(getToken(req, body, urlObj))
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Could not verify this device.' }, 500)
  }
  if (!caller) {
    return json(
      { ok: false, message: 'This device isn’t linked to a Dilla account — open the app once, then try sharing again.' },
      401,
    )
  }
  const userId = caller.userId

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, message: 'Server is missing ANTHROPIC_API_KEY' }, 500)

  // --- screenshot / photo path (no URL) ---
  // The way to capture audience-restricted or age-gated reels (e.g. cocktails):
  // the user screenshots what they can already see and shares the image. Claude
  // vision reads the recipe; the screenshot is NOT used as the cover (it's full
  // of app chrome). No cover is set — the app shows its designed gradient +
  // emoji card until the user adds their own photo.
  const img = getImage(body, urlObj)
  if (img) {
    try {
      const supabase = caller.supabase
      const { recipe: r, model } = await extractRecipeFromImage({ base64: img.base64, mediaType: img.mediaType, apiKey })
      if (!r.found) {
        return json({
          ok: false,
          status: 'no_recipe',
          kind: 'image',
          message: r.notes_for_user || "Couldn't find a recipe in that screenshot. Make sure the ingredients and steps are visible.",
        })
      }
      const record = toRecord(r, { url: null, sourcePlatform: 'instagram', sourceKind: 'screenshot', imageUrl: null, model })
      const { data, error } = await insertRecipe(supabase, userId, record)
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
    const supabase = caller.supabase

    if (isInstagram(link)) {
      const res = await extractReel(link, { apiKey })
      const r = res.recipe
      if (r.found) {
        // Skip the embed's lookaside cover — it carries Instagram's play-button overlay. Save
        // without an image, then a 'cover' job pulls Apify's clean, higher-res cover and fills it
        // in live (~1-2 min via the on-demand worker).
        const record = toRecord(r, { url: link, sourcePlatform: 'instagram', sourceKind: 'caption', imageUrl: null, model: res.model })
        const { data, error } = await insertRecipe(supabase, userId, record)
        if (error) throw error
        await insertJob(supabase, userId, { url: link, kind: 'cover', meta: { recipe_id: data.id } })
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
        const target = normalizeUrl(r.external_url)
        if (target) {
          // This call used to be completely unguarded, so every way it can fail
          // reached the user as a 502 full of raw developer text: a scheme-less
          // URL threw "Failed to parse URL", a dead caption link threw HTTP 404,
          // and a bot-shielded publisher threw HTTP 402. None of those are worth
          // surfacing — they all mean the same thing to the user, which is that
          // we couldn't read the linked page, so fall through to the friendly
          // "open it and share the page" message below.
          try {
            const web = await extractWebPage({ url: target, apiKey })
            if (web.recipe.found) {
              const cover = await coverImage(supabase, { srcUrl: web.imageUrl, keyHint: web.recipe.title || r.title || 'recipe' })
              const record = toRecord(web.recipe, { url: target, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover, model: web.model })
              const { data, error } = await insertRecipe(supabase, userId, record)
              if (error) throw error
              return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
            }
          } catch {
            /* unreadable linked page — recovery below gets a turn */
          }
        }

        // No usable link in the caption ("recipe in my bio!"), or the linked page
        // didn't pan out. Go to the creator's own blog and find the post: search
        // their site for the dish, and only accept an unambiguous winner that
        // carries a real recipe. Deterministic, free, and ~0.5-2s, which is why
        // it runs here rather than on the worker.
        const recovered = await recoverFromCreatorSite({
          supabase,
          handle: res.handle,
          dish: r.title,
          captionUrl: target,
          captionDomain: r.creator_domain,
        })
        if (recovered.ok) {
          const cover = await coverImage(supabase, {
            srcUrl: recovered.recipe.image_url,
            keyHint: recovered.recipe.title || r.title || 'recipe',
          })
          const record = toRecord(
            { ...recovered.recipe, source_author: r.source_author ?? res.handle ?? null },
            { url: recovered.url, sourcePlatform: 'web', sourceKind: 'link_in_bio', imageUrl: cover, model: 'json-ld' },
          )
          const { data, error } = await insertRecipe(supabase, userId, record)
          if (error) throw error
          return json({
            ok: true,
            status: 'saved',
            kind: 'link_in_bio',
            recipe_id: data.id,
            title: record.title,
            image_url: record.image_url,
            message: `Saved “${record.title}” — found it on ${recovered.domain}.`,
          })
        }

        // Abstained on purpose. Saying WHY beats a generic failure, and saving a
        // near-miss from the right creator would quietly corrupt the library.
        const who = res.handle ? `@${res.handle}'s` : "the creator's"
        return json({
          ok: false,
          status: 'link_in_bio',
          kind: 'instagram',
          message: `This recipe lives on ${who} blog and I couldn’t confirm which post it is (${recovered.reason}). Open the link in the reel and share that page instead.`,
        })
      }
      // Otherwise the recipe is in the video itself -> queue the video (Apify) path.
      const { data, error } = await insertJob(supabase, userId, { url: link, kind: 'video', meta: {} })
      if (error) throw error
      return json({ ok: true, status: 'queued', kind: 'video', job_id: data.id, message: 'Queued — the recipe’s in the video. It’ll appear in a minute or two.' })
    }

    // A Pinterest pin is unreadable server-side, but the pin's widget metadata
    // exposes the page it points at — so resolve the pin and carry on with THAT
    // url, which makes a shared pin import exactly like sharing the blog.
    // (`pin.it` is the short link the iOS share sheet produces; it carries no
    // pin id, so resolvePinterestLink expands it first.)
    let pageUrl = link
    if (isPinterest(hostOf(link))) {
      const pin = await resolvePinterestLink(link)
      const dest = pin?.link && !isPinterest(hostOf(pin.link)) ? pin.link : null
      if (!dest) {
        return json({
          ok: false,
          status: 'no_recipe',
          kind: 'pinterest',
          message:
            'That pin doesn’t link out to a recipe page — it’s just an image or video. Screenshot the recipe and share the image instead.',
        })
      }
      pageUrl = dest
    }
    const host = hostOf(pageUrl)

    // Generic web URL (recipe blog, Pinterest-resolved link, etc.) — fast path, save directly.
    let res
    try {
      res = await extractWebPage({ url: pageUrl, apiKey })
    } catch (e) {
      // A bot shield answered instead of the page. This is common on the big
      // recipe publishers that Pinterest pins point at, and it is not something
      // a retry fixes — the screenshot path reads what the USER can see.
      if (e?.blocked) {
        return json({
          ok: false,
          status: 'blocked',
          kind: 'web',
          message: `${host || 'That site'} blocks apps from reading its pages. Screenshot the recipe and share the image instead — that works every time.`,
        })
      }
      throw e
    }
    if (res.recipe.found) {
      const cover = await coverImage(supabase, { srcUrl: res.imageUrl, keyHint: res.recipe.title || 'recipe' })
      const record = toRecord(res.recipe, { url: pageUrl, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover, model: res.model })
      const { data, error } = await insertRecipe(supabase, userId, record)
      if (error) throw error
      return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
    }
    // The page loaded but carried no recipe. Other JS-only shells (TikTok,
    // Facebook) land here; Pinterest is answered earlier, before the fetch.
    const jsOnlySite = /tiktok\.|facebook\./i.test(host ?? '')
    return json({
      ok: false,
      status: 'no_recipe',
      message: jsOnlySite
        ? `${host} doesn’t share its recipe text with apps. Screenshot the recipe and share the image instead — that works every time.`
        : 'Couldn’t find a recipe at that link. If you can see the recipe on screen, screenshot it and share the image instead.',
    })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Something went wrong.' }, 502)
  }
}
