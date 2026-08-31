// Synchronous extraction endpoint for the FAST paths: Instagram caption + generic web page.
// POST { url } -> { ok: true, source_kind, recipe } | { ok: false, reason, message, draft }
// Slow paths (link-in-bio web_search, video) are handled async elsewhere — this returns a
// reason so the client can route them.
import { extractReel, extractWebPage, extractRecipeFromText, normalizeUrl } from './_lib/extract.mjs'
import { recoverFromCreatorSite } from './_lib/creatorSite.mjs'
import { isTikTokUrl, fetchTikTokPost } from './_lib/tiktok.mjs'
import { rehostImage, appClient } from './_lib/images.mjs'
import { adminClient as usageAdmin, userFromJwt, reserveImport, refundImport, limitMessage } from './_lib/usage.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Authorization is REQUIRED here: the native app calls from
  // capacitor://localhost (cross-origin), and a preflight that doesn't allow
  // the auth header makes WebKit fail every request with "Load failed".
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

const isInstagram = (url) => /instagram\.com\//i.test(url)

// Normalize the various extractor outputs into one draft-recipe shape for the review screen.
function toDraft({ recipe, sourceUrl, sourcePlatform, sourceKind, model, imageUrl }) {
  return {
    title: recipe.title ?? '',
    description: recipe.description ?? null,
    source_platform: sourcePlatform,
    source_url: recipe.source_url ?? sourceUrl,
    source_author: recipe.source_author ?? null,
    image_url: imageUrl ?? null,
    servings: recipe.servings ?? null,
    prep_minutes: recipe.prep_minutes ?? null,
    cook_minutes: recipe.cook_minutes ?? null,
    total_minutes: recipe.total_minutes ?? null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    extraction_meta: {
      source_kind: sourceKind,
      model: model ?? null,
      confidence: recipe.confidence ?? null,
      notes: recipe.notes ?? recipe.notes_for_user ?? null,
    },
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'Server is missing ANTHROPIC_API_KEY' }, 500)

  let url
  try {
    ;({ url } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!url || typeof url !== 'string') return json({ error: 'Missing "url" in body' }, 400)

  // --- who is asking, and do they have budget left ---
  // This endpoint spends Anthropic credit on every call, so it is signed-in only
  // (it used to be open to anyone who found the URL) and metered like the share
  // path. The slot is released below if no recipe actually comes back.
  const userId = await userFromJwt(req)
  if (!userId) return json({ error: 'Please sign in to import recipes.' }, 401)
  const meterAdmin = usageAdmin()
  const reservation = await reserveImport(meterAdmin, userId, 'web')
  if (!reservation.allowed) {
    return json({ ok: false, reason: 'limit_reached', message: limitMessage(reservation) })
  }
  let keepCharge = false

  try {
    if (isTikTokUrl(url)) {
      // Caption-first, exactly like Instagram — except TikTok's caption very
      // often IS the whole recipe, read for free from the documented oEmbed API.
      const post = await fetchTikTokPost(url)
      if (post.inaccessible) {
        return json({
          ok: false,
          reason: 'inaccessible',
          message: "Couldn't read this TikTok — it looks private or removed. Screenshot the recipe and share the image instead.",
          draft: toDraft({ recipe: {}, sourceUrl: post.canonicalUrl, sourcePlatform: 'tiktok', sourceKind: 'manual', model: null, imageUrl: null }),
        })
      }
      const { recipe: r, model } = await extractRecipeFromText({ text: post.caption, sourceUrl: post.canonicalUrl, apiKey })
      const withAuthor = { ...r, source_author: r.source_author ?? post.author }
      if (r.found) {
        const cover = await rehostImage(await appClient(), post.imageUrl, r.title || 'tiktok')
        keepCharge = true
        return json({
          ok: true,
          source_kind: 'caption',
          recipe: toDraft({ recipe: withAuthor, sourceUrl: post.canonicalUrl, sourcePlatform: 'tiktok', sourceKind: 'caption', model, imageUrl: cover || post.imageUrl }),
        })
      }
      // No recipe in the caption -> it's demonstrated in the video. The client
      // queues a video job off this reason, same as Instagram.
      return json({
        ok: false,
        reason: 'video_only',
        message: r.notes_for_user || "No recipe in the caption — this one's in the video.",
        draft: toDraft({ recipe: withAuthor, sourceUrl: post.canonicalUrl, sourcePlatform: 'tiktok', sourceKind: 'manual', model, imageUrl: post.imageUrl }),
      })
    }

    if (isInstagram(url)) {
      const res = await extractReel(url, { apiKey })
      const r = res.recipe
      if (r.found) {
        const cover = await rehostImage(await appClient(), res.imageUrl, r.title || 'reel')
        keepCharge = true
        return json({
          ok: true,
          source_kind: 'caption',
          recipe: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'caption', model: res.model, imageUrl: cover || res.imageUrl }),
        })
      }
      // The anonymous embed couldn't read it — which an AGE GATE causes just as
      // readily as a real audience restriction, and the two are indistinguishable
      // from here. Apify reads Instagram logged in, so it clears an age gate and
      // only truly fails on audience-restricted posts. Route it down the same
      // ladder as video_only rather than declaring it unreadable: the client
      // queues the job, and the worker either gets the recipe or says plainly
      // that the post is restricted (refunding the slot when it does).
      if (res.inaccessible) {
        return json({ ok: false, reason: 'video_only', message: 'This one needs a closer look — queuing it.' })
      }
      // Recipe is on the creator's blog. Same ladder as the share path: a link
      // in the caption -> fetch it; no link -> find the post on the creator's
      // own site; still nothing -> the video usually demonstrates it anyway, so
      // report video_only and the client queues the video job.
      if (r.where_is_recipe === 'external_link' || r.external_url) {
        const target = normalizeUrl(r.external_url)
        if (target) {
          try {
            const web = await extractWebPage({ url: target, apiKey })
            if (web.recipe.found) {
              const cover = await rehostImage(await appClient(), web.imageUrl, web.recipe.title || r.title || 'recipe')
              keepCharge = true
              return json({
                ok: true,
                source_kind: 'web',
                recipe: toDraft({ recipe: web.recipe, sourceUrl: target, sourcePlatform: 'web', sourceKind: 'web', model: web.model, imageUrl: cover || web.imageUrl }),
              })
            }
          } catch {
            /* unreadable linked page — recovery below gets a turn */
          }
        }
        const recovered = await recoverFromCreatorSite({
          // Service role: recipe_creators is server-maintained and its client
          // write policies are revoked (cache-poisoning guard).
          supabase: usageAdmin() ?? (await appClient()),
          handle: res.handle,
          dish: r.title,
          captionUrl: target,
          captionDomain: r.creator_domain,
        })
        if (recovered.ok) {
          const cover = await rehostImage(await appClient(), recovered.recipe.image_url, recovered.recipe.title || r.title || 'recipe')
          keepCharge = true
          return json({
            ok: true,
            source_kind: 'web',
            recipe: toDraft({
              recipe: { ...recovered.recipe, source_author: r.source_author ?? res.handle ?? null },
              sourceUrl: recovered.url,
              sourcePlatform: 'web',
              sourceKind: 'link_in_bio',
              model: 'json-ld',
              imageUrl: cover || recovered.recipe.image_url,
            }),
          })
        }
        return json({
          ok: false,
          reason: 'video_only',
          message: 'The written recipe is on their blog and couldn’t be confirmed — reading it from the video instead.',
          draft: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'manual', model: res.model, imageUrl: res.imageUrl }),
        })
      }
      // Otherwise the recipe is demonstrated in the video itself.
      return json({
        ok: false,
        reason: 'video_only',
        message: r.notes_for_user || "No recipe in the caption — this one's in the video.",
        draft: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'manual', model: res.model, imageUrl: res.imageUrl }),
      })
    }

    // Generic web URL (recipe blog, Pinterest-resolved link, etc.)
    const res = await extractWebPage({ url, apiKey })
    if (res.recipe.found) {
      const cover = await rehostImage(await appClient(), res.imageUrl, res.recipe.title || 'recipe')
      keepCharge = true
      return json({
        ok: true,
        source_kind: 'web',
        recipe: toDraft({ recipe: res.recipe, sourceUrl: url, sourcePlatform: 'web', sourceKind: 'web', model: res.model, imageUrl: cover || res.imageUrl }),
      })
    }
    return json({
      ok: false,
      reason: 'no_recipe',
      message: 'Could not find a recipe at that link.',
      draft: toDraft({ recipe: res.recipe, sourceUrl: url, sourcePlatform: 'web', sourceKind: 'manual', model: res.model, imageUrl: res.imageUrl }),
    })
  } catch (e) {
    // A bot shield answered instead of the page. submit.mjs has said this
    // nicely for a while; this path was still handing the user
    // "Web page fetch failed (HTTP 403)", which reads as the app being broken.
    if (e?.blocked) {
      let host = ''
      try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep it generic */ }
      return json({
        ok: false,
        reason: 'no_recipe',
        message: `${host || 'That site'} blocks apps from reading its pages. Screenshot the recipe and share the image instead — that works every time.`,
        // A draft is REQUIRED here, empty or not: the review screen bounces
        // straight back to /add when there isn't one, so omitting it makes the
        // whole attempt vanish with no message at all.
        draft: toDraft({
          recipe: {},
          sourceUrl: url,
          sourcePlatform: 'web',
          sourceKind: 'manual',
          model: null,
          imageUrl: null,
        }),
      })
    }
    return json({ error: e?.message || 'Extraction failed' }, 502)
  } finally {
    // No draft came back (or it threw) — hand the slot back rather than charging
    // for a failed import. Note the user is charged at EXTRACT time, not at save:
    // the money is spent here, and abandoning the review screen still cost it.
    if (reservation.metered && !keepCharge) await refundImport(meterAdmin, userId, 'web')
  }
}
