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
import { extractReel, extractWebPage, extractRecipeFromImage, extractRecipeFromText, resolvePinterestLink, normalizeUrl } from './_lib/extract.mjs'
import { recoverFromCreatorSite } from './_lib/creatorSite.mjs'
import { isTikTokUrl, fetchTikTokPost } from './_lib/tiktok.mjs'
import { coverImage } from './_lib/images.mjs'
import { adminClient as usageAdmin, reserveImport, refundImport, limitMessage } from './_lib/usage.mjs'

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

  // --- monthly import cap ---
  // Claimed BEFORE any paid work so a burst of parallel shares can't run up a
  // bill past the cap, and released again if nothing gets saved. The kind is
  // provisional: an Instagram link is assumed to be a cheap caption import and
  // is re-classified below if it turns out to need the expensive video path.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, message: 'Server is missing ANTHROPIC_API_KEY' }, 500)

  const meterAdmin = usageAdmin()
  const img = getImage(body, urlObj)
  let chargedKind = img ? 'screenshot' : 'web'
  let keepCharge = false
  const reservation = await reserveImport(meterAdmin, userId, chargedKind)
  if (!reservation.allowed) {
    return json({ ok: false, status: 'limit_reached', kind: 'limit', message: limitMessage(reservation) }, 200)
  }
  const releaseIfUnused = async () => {
    if (reservation.metered && !keepCharge) await refundImport(meterAdmin, userId, chargedKind)
  }

  // --- screenshot / photo path (no URL) ---
  // The way to capture audience-restricted or age-gated reels (e.g. cocktails):
  // the user screenshots what they can already see and shares the image. Claude
  // vision reads the recipe; the screenshot is NOT used as the cover (it's full
  // of app chrome). No cover is set — the app shows its designed gradient +
  // emoji card until the user adds their own photo.
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
      keepCharge = true
      return json({ ok: true, status: 'saved', kind: 'screenshot', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” from your screenshot.` })
    } catch (e) {
      return json({ ok: false, message: e?.message || 'Could not read the screenshot.' }, 502)
    } finally {
      await releaseIfUnused()
    }
  }

  // --- resolve the shared URL ---
  const rawInput =
    (body && (body.url ?? body.text ?? body.shared)) || rawText || urlObj.searchParams.get('url') || ''
  const link = firstUrl(rawInput) || (typeof rawInput === 'string' ? rawInput.trim() : '')
  if (!link || !/^https?:\/\//i.test(link)) {
    await releaseIfUnused()
    return json({ ok: false, message: 'No valid link was shared.' }, 400)
  }

  try {
    const supabase = caller.supabase

    if (isTikTokUrl(link)) {
      // Caption-first, like Instagram — except TikTok's caption very often IS
      // the complete recipe, and it comes from the documented oEmbed API for
      // free. fetchTikTokPost also expands the vm.tiktok.com short links the
      // iOS share sheet produces.
      const post = await fetchTikTokPost(link)
      if (post.inaccessible) {
        return json({
          ok: false,
          status: 'inaccessible',
          kind: 'tiktok',
          message: "Couldn't read this TikTok — it looks private or removed. Screenshot the recipe and share the image instead.",
        })
      }
      const { recipe: r, model } = await extractRecipeFromText({ text: post.caption, sourceUrl: post.canonicalUrl, apiKey })
      if (r.found) {
        const cover = await coverImage(supabase, { srcUrl: post.imageUrl, keyHint: r.title || 'tiktok' })
        const record = toRecord(
          { ...r, source_author: r.source_author ?? post.author },
          { url: post.canonicalUrl, sourcePlatform: 'tiktok', sourceKind: 'caption', imageUrl: cover, model },
        )
        const { data, error } = await insertRecipe(supabase, userId, record)
        if (error) throw error
        if (!record.steps.length) {
          // Ingredients-only caption — the worker watches the video and fills
          // in the steps. (The cover already exists from the oEmbed thumbnail.)
          await insertJob(supabase, userId, { url: post.canonicalUrl, kind: 'video', meta: { recipe_id: data.id, backfill: 'steps' } })
        }
        keepCharge = true
        return json({ ok: true, status: 'saved', kind: 'caption', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
      }
      // Caption points at a blog? Cheap fetch before committing to the video path.
      const external = normalizeUrl(r.external_url)
      if (external) {
        try {
          const web = await extractWebPage({ url: external, apiKey })
          if (web.recipe.found) {
            const cover = await coverImage(supabase, { srcUrl: web.imageUrl, keyHint: web.recipe.title || r.title || 'recipe' })
            const record = toRecord(web.recipe, { url: external, sourcePlatform: 'web', sourceKind: 'web', imageUrl: cover, model: web.model })
            const { data, error } = await insertRecipe(supabase, userId, record)
            if (error) throw error
            keepCharge = true
            return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
          }
        } catch {
          /* unreadable page — the video itself is still worth a shot below */
        }
      }
      // Recipe's demonstrated in the video -> the worker watches it. Swap the
      // provisional cheap slot for a video one, exactly like the Instagram path:
      // video is the expensive kind and carries its own sub-cap.
      if (reservation.metered) {
        await refundImport(meterAdmin, userId, chargedKind)
        const videoRes = await reserveImport(meterAdmin, userId, 'video')
        if (!videoRes.allowed) {
          keepCharge = true // nothing left reserved to release
          return json({ ok: false, status: 'limit_reached', kind: 'limit', message: limitMessage(videoRes) })
        }
        chargedKind = 'video'
      }
      const { data, error } = await insertJob(supabase, userId, { url: post.canonicalUrl, kind: 'video', meta: { charged_kind: 'video' } })
      if (error) throw error
      keepCharge = true
      return json({ ok: true, status: 'queued', kind: 'video', job_id: data.id, message: 'Queued — the recipe’s in the video. It’ll appear in a minute or two.' })
    }

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
        if (!record.steps.length) {
          // Caption carried the ingredients but not the method ("here's your
          // shopping list…") — a half recipe on the headline path. Queue a
          // steps backfill: the worker watches the video and fills in the
          // steps (and the cover, so no separate cover job is needed).
          await insertJob(supabase, userId, { url: link, kind: 'video', meta: { recipe_id: data.id, backfill: 'steps' } })
        } else {
          await insertJob(supabase, userId, { url: link, kind: 'cover', meta: { recipe_id: data.id } })
        }
        keepCharge = true
        return json({ ok: true, status: 'saved', kind: 'caption', recipe_id: data.id, title: record.title, image_url: null, message: `Saved “${record.title}” to your library.` })
      }
      // The PUBLIC embed couldn't read it. That is NOT the same as unreadable:
      // the anonymous embed is blocked by an AGE GATE just as surely as by a
      // real audience restriction, and from out here the two look identical.
      // Apify reads Instagram through logged-in accounts, so it walks straight
      // through an age gate — it only genuinely fails on audience-restricted
      // posts, where it returns restricted_page and the worker says so plainly.
      //
      // So hand it to the worker instead of guessing. An age-gated reel whose
      // recipe sits in the caption used to fail outright; now it imports. If it
      // really is restricted, the job fails and the worker refunds the slot.
      if (res.inaccessible) {
        if (reservation.metered) {
          await refundImport(meterAdmin, userId, chargedKind)
          const videoRes = await reserveImport(meterAdmin, userId, 'video')
          if (!videoRes.allowed) {
            keepCharge = true // nothing left reserved to release
            return json({ ok: false, status: 'limit_reached', kind: 'limit', message: limitMessage(videoRes) })
          }
          chargedKind = 'video'
        }
        const { data, error } = await insertJob(supabase, userId, {
          url: link,
          kind: 'video',
          meta: { charged_kind: 'video' },
        })
        if (error) throw error
        keepCharge = true
        return json({
          ok: true,
          status: 'queued',
          kind: 'video',
          job_id: data.id,
          message: 'Queued — this one needs a closer look. It’ll appear in a minute or two.',
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
              keepCharge = true
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
          keepCharge = true
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

        // Couldn't confirm the blog post — but "link in bio" reels very often
        // demonstrate the whole recipe on camera anyway, so before giving up,
        // hand the reel to the video pipeline. Only if the video allowance is
        // gone do we fall back to the honest tell-the-user message.
        if (reservation.metered) {
          await refundImport(meterAdmin, userId, chargedKind)
          const videoRes = await reserveImport(meterAdmin, userId, 'video')
          if (!videoRes.allowed) {
            keepCharge = true // nothing left reserved to release
            const who = res.handle ? `@${res.handle}'s` : "the creator's"
            return json({
              ok: false,
              status: 'link_in_bio',
              kind: 'instagram',
              message: `This recipe lives on ${who} blog and I couldn’t confirm which post it is. Open the link in the reel and share that page instead.`,
            })
          }
          chargedKind = 'video'
        }
        const { data: vjob, error: vErr } = await insertJob(supabase, userId, { url: link, kind: 'video', meta: { charged_kind: 'video' } })
        if (vErr) throw vErr
        keepCharge = true
        return json({ ok: true, status: 'queued', kind: 'video', job_id: vjob.id, message: 'Queued — reading the recipe from the video. It’ll appear in a minute or two.' })
      }
      // Otherwise the recipe is in the video itself -> queue the video (Apify) path.
      //
      // Re-charge as 'video' first. This is the one genuinely expensive kind
      // (download + transcribe + vision, ~3-5c against well under a cent for the
      // rest), so it carries its own sub-cap — and we only learn a reel needs it
      // here, after the caption came back empty. Swap the provisional cheap slot
      // for a video one; if the video allowance is gone, nothing is queued.
      if (reservation.metered) {
        await refundImport(meterAdmin, userId, chargedKind)
        const videoRes = await reserveImport(meterAdmin, userId, 'video')
        if (!videoRes.allowed) {
          keepCharge = true // nothing left reserved to release
          return json({ ok: false, status: 'limit_reached', kind: 'limit', message: limitMessage(videoRes) })
        }
        chargedKind = 'video'
      }
      const { data, error } = await insertJob(supabase, userId, { url: link, kind: 'video', meta: { charged_kind: 'video' } })
      if (error) throw error
      keepCharge = true
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
        // Not a dead end any more: the worker can reach these through Apify,
        // which runs inside their platform and so can use their proxy. Queue it
        // rather than sending the user off to take a screenshot.
        // If queueing fails for ANY reason - an unknown kind, the metering
        // trigger, anything - fall back to exactly what we said before this
        // path existed. A new capability must never make the failure worse
        // than the failure it replaced.
        const { data, error } = await insertJob(supabase, userId, {
          url: link,
          kind: 'web',
          meta: { charged_kind: chargedKind },
        })
        if (!error && data) {
          keepCharge = true
          return json({
            ok: true,
            status: 'queued',
            kind: 'web',
            job_id: data.id,
            message: `${host || 'That site'} is slow to open up — fetching it another way. It'll appear in a minute or two.`,
          })
        }
        console.warn(`[submit] could not queue web job for ${host}: ${error?.message}`)
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
      keepCharge = true
      return json({ ok: true, status: 'saved', kind: 'web', recipe_id: data.id, title: record.title, image_url: record.image_url, message: `Saved “${record.title}” to your library.` })
    }
    // The page loaded but carried no recipe. Other JS-only shells (Facebook)
    // land here; Pinterest and TikTok are answered earlier, before the fetch.
    const jsOnlySite = /facebook\./i.test(host ?? '')
    return json({
      ok: false,
      status: 'no_recipe',
      message: jsOnlySite
        ? `${host} doesn’t share its recipe text with apps. Screenshot the recipe and share the image instead — that works every time.`
        : 'Couldn’t find a recipe at that link. If you can see the recipe on screen, screenshot it and share the image instead.',
    })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Something went wrong.' }, 502)
  } finally {
    // Any path that didn't actually save or queue something hands its slot back,
    // including thrown errors — a failed import shouldn't cost the user quota.
    await releaseIfUnused()
  }
}
