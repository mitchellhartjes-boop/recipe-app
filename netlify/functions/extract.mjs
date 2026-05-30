// Synchronous extraction endpoint for the FAST paths: Instagram caption + generic web page.
// POST { url } -> { ok: true, source_kind, recipe } | { ok: false, reason, message, draft }
// Slow paths (link-in-bio web_search, video) are handled async elsewhere — this returns a
// reason so the client can route them.
import { extractReel, extractWebPage } from './_lib/extract.mjs'
import { rehostImage, appClient } from './_lib/images.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  try {
    if (isInstagram(url)) {
      const res = await extractReel(url, { apiKey })
      const r = res.recipe
      if (r.found) {
        const cover = await rehostImage(await appClient(), res.imageUrl, r.title || 'reel')
        return json({
          ok: true,
          source_kind: 'caption',
          recipe: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'caption', model: res.model, imageUrl: cover || res.imageUrl }),
        })
      }
      // Couldn't read the reel at all (private / audience-restricted / removed).
      if (res.inaccessible) {
        return json({
          ok: false,
          reason: 'inaccessible',
          message:
            "Instagram wouldn't show this reel without logging in (it looks private or audience-restricted), so it can't be read automatically.",
          draft: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'manual', model: res.model, imageUrl: res.imageUrl }),
        })
      }
      // Route by where Claude says the recipe lives (blog/bio link vs the video itself).
      const reason = r.where_is_recipe === 'external_link' || r.external_url ? 'link_in_bio' : 'video_only'
      return json({
        ok: false,
        reason,
        message:
          r.notes_for_user ||
          (reason === 'link_in_bio'
            ? "No recipe in the caption — it's on the creator's blog. We'll recover it."
            : "No recipe in the caption — this one's likely in the video."),
        draft: toDraft({ recipe: r, sourceUrl: url, sourcePlatform: 'instagram', sourceKind: 'manual', model: res.model, imageUrl: res.imageUrl }),
        recover: reason === 'link_in_bio' ? { title: r.title, author: r.source_author, externalUrl: r.external_url ?? null } : null,
      })
    }

    // Generic web URL (recipe blog, Pinterest-resolved link, etc.)
    const res = await extractWebPage({ url, apiKey })
    if (res.recipe.found) {
      const cover = await rehostImage(await appClient(), res.imageUrl, res.recipe.title || 'recipe')
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
    return json({ error: e?.message || 'Extraction failed' }, 502)
  }
}
