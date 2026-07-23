// Link-in-bio recovery: turn "full recipe in my bio!" into the actual recipe.
//
// The reel gives us two facts — the creator's handle and the dish name Claude
// pulled from the caption. That is enough to go straight to the creator's own
// blog and find the post, without ever resolving the bio link:
//
//   handle -> creator's domain -> site search for the dish -> confidence gate
//          -> fetch the winning page -> read its JSON-LD Recipe
//
// Every leg is a plain HTTP call. Measured end to end at roughly 0.5-2.3s for
// $0, which is what makes this viable INLINE inside submit.mjs's ~10s budget —
// no job queue, so the user gets the recipe in the same share.
//
// This replaces the retired recoverFromWeb() (Claude + web_search), which was
// measured at 6m14s and ~$0.28 per import, and which confabulated: it reported
// the caption's wording as the recipe title instead of the page's real title.
//
// THE CORRECTNESS PROBLEM, because it is the whole design constraint: WordPress
// search is fuzzy full-text and almost always returns SOMETHING. Searched
// sloppily, a sausage-and-clam-linguine reel comes back with Spaghetti
// Arrabbiata. Silently saving that is far worse than failing, so nothing is
// saved unless the title agreement, the runner-up margin, AND the presence of a
// real Recipe block all agree. The gate is deliberately biased toward abstaining.

import { WEB_UA } from './extract.mjs'

// The caller is inside a ~10s function that has already spent 3-5s reading the
// caption, so the whole recovery runs against ONE overall deadline rather than
// per-leg timeouts that can stack: two 3.5s searches plus a page fetch would
// blow the budget on their own. Each leg gets the smaller of its own ceiling and
// whatever is left, and legs are skipped entirely when time has run out.
const RECOVERY_BUDGET_MS = 6500
const T_SEARCH = 4000
const T_PAGE = 4000
const T_VERIFY = 2500

async function fetchWithTimeout(url, { timeout = 4000, ...init } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers || {}) },
    })
  } finally {
    clearTimeout(timer)
  }
}

// ---- dish-name normalization ----------------------------------------------
// Creators pad titles with hooks and occasions ("NYE Italian Minestrone Soup"),
// and those extra words actively hurt: they degrade the blog's own relevance
// ranking and can drop the true match to zero hits. Strip them from both the
// query and the comparison so we match on the dish, not the marketing.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'your', 'this', 'that', 'and', 'or', 'with', 'for', 'in', 'of', 'to', 'on',
  'recipe', 'recipes', 'easy', 'best', 'homemade', 'classic', 'style', 'quick', 'simple', 'ultimate',
  'perfect', 'authentic', 'favorite', 'favourite', 'amazing', 'delicious', 'healthy', 'viral', 'famous',
  'minute', 'minutes', 'ingredient', 'ingredients', 'nye', 'christmas', 'thanksgiving', 'holiday',
  'summer', 'winter', 'fall', 'spring', 'weeknight', 'super', 'super-easy', 'copycat',
])

export function dishTokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && t.length > 1 && !STOPWORDS.has(t))
}

/** The search string to send to the creator's site — the dish, minus the hooks. */
export function searchQuery(dish) {
  const tokens = dishTokens(dish)
  return tokens.length ? tokens.join(' ') : String(dish ?? '').trim()
}

// ---- candidate scoring -----------------------------------------------------
// Two axes over stopword-stripped tokens:
//   coverage — fraction of the DISH's tokens present in the candidate title.
//              This is the one that matters: it asks "does this title contain
//              everything the dish is?".
//   jaccard  — overlap both ways, which penalizes a title that covers the dish
//              but carries a lot of extra (a roundup, or a different variant).
// A token counts as present on an exact match, or a prefix match for longer
// words so "meatballs"/"meatball" agree.
function present(token, candidateTokens) {
  if (candidateTokens.includes(token)) return true
  if (token.length > 4) return candidateTokens.some((c) => c.startsWith(token) || token.startsWith(c))
  return false
}

export function scoreTitle(dish, title) {
  const d = dishTokens(dish)
  const c = dishTokens(title)
  if (!d.length || !c.length) return { coverage: 0, jaccard: 0, containment: 0 }
  const hit = d.filter((t) => present(t, c)).length
  const coverage = hit / d.length
  const union = new Set([...d, ...c]).size
  const jaccard = union ? hit / union : 0
  // The mirror of coverage: what fraction of the CANDIDATE's words the dish
  // accounts for. Full containment means the blog title is a shorter version of
  // what the reel called the dish ("Chicken Enchilada Skillet" for a reel titled
  // "Cheesy Chicken Enchilada Skillet") — extremely common, since creators drop
  // adjectives between the two. Crucially it does NOT let a genuinely different
  // dish through: "Cajun Ranch Chicken Pasta" introduces "ranch", a word the
  // reel never used, so containment breaks and the strict rule still applies.
  const containment = c.filter((t) => present(t, d)).length / c.length
  return { coverage, jaccard, containment }
}

// Accept only a clear, unambiguous winner.
//
// MARGIN is the load-bearing term and the reason near-duplicates don't slip
// through: a creator with both "Cake Batter Ice Cream" and "Loaded Cake Batter
// Ice Cream" produces two candidates that each contain every dish token, so
// coverage alone would happily pick one at random. Requiring daylight between
// first and second turns "best guess" into "confident guess", and when there
// isn't any we abstain instead of coin-flipping.
const MIN_COVERAGE = 0.8
// Relaxed floor, allowed ONLY when the candidate title is fully contained in the
// dish name (see scoreTitle) — i.e. the creator used fewer words for the same
// dish, not different words for a different dish.
const MIN_COVERAGE_CONTAINED = 0.6
const MIN_MARGIN = 0.2

const strongEnough = (c) =>
  c.coverage >= MIN_COVERAGE || (c.containment === 1 && c.coverage >= MIN_COVERAGE_CONTAINED)

export function pickBest(dish, candidates) {
  // Blogs routinely list one post twice — commonly the article and its recipe
  // card, under different URLs. Deduped by TITLE rather than URL on purpose:
  // two hits with the same title are the same dish, and treating them as rivals
  // drives the margin to zero and makes us abstain on a post that never had a
  // real competitor (verified on erinliveswhole, which returns "Chicken
  // Enchilada Skillet" twice). The blog's own ranking decides which URL wins.
  const groups = new Map()
  for (const c of candidates) {
    const key = dishTokens(c.title).join(' ')
    if (!key) continue
    if (groups.has(key)) groups.get(key).alternates.push(c.url)
    else groups.set(key, { ...c, alternates: [] })
  }
  const unique = [...groups.values()]

  const scored = unique
    .map((c) => ({ ...c, ...scoreTitle(dish, c.title) }))
    .sort((a, b) => b.coverage + b.jaccard - (a.coverage + a.jaccard))
  if (!scored.length) return { best: null, reason: 'no candidates' }

  const [top, second] = scored
  if (!strongEnough(top)) return { best: null, reason: 'weak title match', scored }
  const margin = second ? top.coverage + top.jaccard - (second.coverage + second.jaccard) : 1
  if (margin < MIN_MARGIN) return { best: null, reason: 'ambiguous between similar posts', scored }
  return { best: top, margin, scored }
}

// ---- WordPress site search -------------------------------------------------
// /wp/v2/search (not /wp/v2/posts?search=) because it spans ALL post types —
// several food blogs keep recipes in a custom type that /posts silently misses.
export async function searchWordPress(domain, dish, timeout = T_SEARCH) {
  const url = `https://${domain}/wp-json/wp/v2/search?search=${encodeURIComponent(searchQuery(dish))}&per_page=8`
  try {
    const res = await fetchWithTimeout(url, { timeout, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const rows = await res.json()
    if (!Array.isArray(rows)) return []
    return rows
      .filter((r) => r && typeof r.url === 'string' && typeof r.title === 'string')
      // Taxonomy pages are never the recipe. Neither are Google Web Stories,
      // which matter more than they sound: a blog's web-story version of a
      // recipe carries the SAME title as the real post and often outranks it in
      // site search, but it is a stripped AMP page with no recipe data — so
      // without this filter the right dish resolves to an unreadable page.
      .filter((r) => !/\/(category|tag|author|page|web-stories|wprm_recipe)\//i.test(r.url))
      .filter((r) => !/\/print\/?$/i.test(r.url))
      .map((r) => ({ title: decodeEntities(r.title), url: r.url }))
  } catch {
    return []
  }
}

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// ---- JSON-LD Recipe --------------------------------------------------------
// 50 of 54 real recipe pages carry a complete schema.org Recipe block, so the
// page leg needs no model call at all: it is faster, free, and reports the
// page's OWN title rather than something a model inferred.

const isoMinutes = (v) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(v ?? ''))
  if (!m) return null
  const mins = (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0)
  return mins > 0 ? mins : null
}

function flattenInstructions(node) {
  const out = []
  const walk = (v) => {
    if (!v) return
    if (typeof v === 'string') {
      const t = stripTags(v)
      if (t) out.push(t)
      return
    }
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v !== 'object') return
    // A HowToSection wraps its own list of steps.
    if (v.itemListElement) return walk(v.itemListElement)
    if (v.text) {
      const t = stripTags(v.text)
      if (t) out.push(t)
    } else if (v.name) {
      const t = stripTags(v.name)
      if (t) out.push(t)
    }
  }
  walk(node)
  return out
}

const stripTags = (s) =>
  decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

// Some plugins emit every instruction as ONE giant string (verified on
// halfbakedharvest, which returns a single 1,000+ character blob). Saved as-is
// that reads as a wall of text and Cook Mode gets a single unusable "step", so
// break it back into sentences. Only applied to a lone oversized step, and only
// when the split actually produces a plausible list — otherwise leave it alone.
function splitBlobSteps(steps) {
  if (steps.length !== 1 || steps[0].length < 300) return steps
  const parts = steps[0]
    // Split after sentence-ending punctuation followed by a capital or a digit,
    // which avoids breaking on "1 tsp." or "350 degrees F."
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length >= 3 ? parts : steps
}

function firstImage(v) {
  if (!v) return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return firstImage(v[0])
  if (typeof v === 'object') return firstImage(v.url ?? v.contentUrl)
  return null
}

const typeOf = (node) => {
  const t = node?.['@type']
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : []
}

/** Pull a schema.org Recipe out of a page's JSON-LD. Returns null when absent. */
export function jsonLdRecipe(html, sourceUrl) {
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of blocks) {
    let parsed
    try {
      parsed = JSON.parse(b[1].trim())
    } catch {
      continue // a malformed block is common; keep looking
    }
    // A page may ship one node, an array, or an @graph of many.
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed]
    while (queue.length) {
      const node = queue.shift()
      if (!node || typeof node !== 'object') continue
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph'])
      if (!typeOf(node).some((t) => /(^|\/)Recipe$/i.test(t))) continue

      const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
        .map((i) => stripTags(i))
        .filter(Boolean)
      const steps = splitBlobSteps(flattenInstructions(node.recipeInstructions))
      // Guard against a stub Recipe node (some plugins emit an empty shell).
      if (ingredients.length < 2 || steps.length < 1) continue

      const yieldRaw = Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield
      const prep = isoMinutes(node.prepTime)
      const cook = isoMinutes(node.cookTime)
      const total = isoMinutes(node.totalTime) ?? (prep != null && cook != null ? prep + cook : null)

      return {
        found: true,
        title: stripTags(node.name) || null,
        description: stripTags(node.description) || null,
        source_url: sourceUrl,
        // schema.org author is usually an unresolvable @id reference, so it is
        // deliberately not trusted here; the caller supplies the creator.
        source_author: null,
        image_url: firstImage(node.image),
        servings: yieldRaw != null ? stripTags(String(yieldRaw)) : null,
        prep_minutes: prep,
        cook_minutes: cook,
        total_minutes: total,
        ingredients: ingredients.map((raw) => ({ raw })),
        steps,
        tags: [],
        notes: null,
      }
    }
  }
  return null
}

// ---- creator -> domain -----------------------------------------------------

const BAD_DOMAINS = /(^|\.)(instagram|facebook|linktr\.ee|linktree|beacons|komi|stan\.store|bit\.ly|linkin\.bio|later\.com|youtube|tiktok|amazon|amzn)\./i

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * Confirm a guessed domain really belongs to this creator before trusting it.
 *
 * This check exists because guessing is genuinely dangerous: `grilling.com`
 * redirects to Kingsford, a real and unrelated food brand. Requiring the site
 * to point back at the same Instagram handle (or carry a matching site name)
 * killed every false positive in testing.
 */
async function verifyDomain(domain, handle, timeout = T_VERIFY) {
  try {
    const res = await fetchWithTimeout(`https://${domain}/`, { timeout })
    if (!res.ok) return false
    const html = (await res.text()).slice(0, 400_000)
    const h = handle.toLowerCase()
    if (new RegExp(`instagram\\.com/${h}(/|"|'|\\?|$)`, 'i').test(html)) return true
    const siteName = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    return Boolean(siteName) && norm(siteName) === norm(handle)
  } catch {
    return false
  }
}

/**
 * Resolve the creator's blog domain, cheapest and safest first:
 *   0. the cache — resolved once per creator, then never guessed again
 *   1. a URL already visible in the caption
 *   2. a domain the caption extractor read out of the caption text
 *   3. <handle>.com, but only if the site points back at the handle
 */
export async function resolveCreatorDomain({ supabase, handle, captionUrl, captionDomain, timeLeft = () => T_VERIFY }) {
  if (!handle) return null
  const key = handle.toLowerCase()

  const { data: cached } = await supabase.from('recipe_creators').select('domain').eq('handle', key).maybeSingle()
  if (cached?.domain) return { domain: cached.domain, source: 'cache' }

  const fromCaption = domainOf(captionUrl)
  if (fromCaption && !BAD_DOMAINS.test(fromCaption)) return { domain: fromCaption, source: 'caption_url' }

  const stated = captionDomain ? domainOf(`https://${String(captionDomain).replace(/^https?:\/\//, '')}`) : null
  if (stated && !BAD_DOMAINS.test(stated)) return { domain: stated, source: 'caption_domain' }

  // The guess is the only tier that costs a network round trip, and it is also
  // the only one that can be WRONG in a dangerous way, so it is last and always
  // verified. Reserve time for the legs that follow: proving the domain is
  // worthless if there is no budget left to actually read the recipe.
  const budget = Math.min(T_VERIFY, timeLeft() - 2500)
  if (budget < 700) return null
  const guess = `${key.replace(/[._]/g, '')}.com`
  if (!BAD_DOMAINS.test(guess) && (await verifyDomain(guess, key, budget))) return { domain: guess, source: 'handle_guess' }

  return null
}

/** Remember a domain that actually produced a recipe, so it is never guessed again. */
export async function rememberCreator(supabase, handle, domain, source) {
  if (!handle || !domain) return
  // A cache hit has nothing new to record, and rewriting the row would replace
  // how the domain was ORIGINALLY established with "cache" — losing the one
  // piece of provenance worth having if a bad entry ever needs auditing.
  if (source === 'cache') return
  try {
    await supabase
      .from('recipe_creators')
      .upsert({ handle: handle.toLowerCase(), domain, source, updated_at: new Date().toISOString() }, { onConflict: 'handle' })
  } catch {
    /* the cache is an optimization — never fail an import over it */
  }
}

// ---- orchestrator ----------------------------------------------------------

/**
 * @returns {Promise<{ok:true, recipe, url, domain, margin} | {ok:false, reason:string, domain?:string}>}
 */
export async function recoverFromCreatorSite({ supabase, handle, dish, captionUrl, captionDomain, budgetMs = RECOVERY_BUDGET_MS }) {
  if (!dish) return { ok: false, reason: 'no dish name in the caption' }
  const deadline = Date.now() + budgetMs
  const remaining = () => deadline - Date.now()

  const resolved = await resolveCreatorDomain({ supabase, handle, captionUrl, captionDomain, timeLeft: remaining })
  if (!resolved) return { ok: false, reason: "couldn't work out the creator's site" }
  const { domain, source } = resolved

  // Try the full dish name, then a narrowed one. Extra leading adjectives hurt
  // the blog's own relevance ranking — "Cheesy Chicken Enchilada Skillet"
  // returns five unrelated enchilada posts on erinliveswhole.com while "Chicken
  // Enchilada Skillet" puts the right post first. Scoring is always done against
  // the FULL dish name, so narrowing only widens the search, never the gate.
  const tokens = dishTokens(dish)
  const queries = [dish]
  if (tokens.length > 2) queries.push(tokens.slice(1).join(' '))

  let best = null
  let margin = 0
  let reason = 'nothing matching on their site'
  for (const q of queries) {
    // Reserve room for the page fetch that has to follow. Starting a second
    // search with only a second left burns the budget and then abstains with
    // "no readable recipe" on a post we had already correctly identified.
    const left = remaining()
    if (left < 2500) break
    const candidates = await searchWordPress(domain, q, Math.min(T_SEARCH, left))
    if (!candidates.length) continue
    const picked = pickBest(dish, candidates)
    if (picked.best) {
      best = picked.best
      margin = picked.margin
      break
    }
    reason = picked.reason || 'no confident match'
  }
  if (!best) return { ok: false, reason, domain }

  // Try the winner, then any same-title duplicate. Alternates are the SAME dish
  // by definition (they were grouped by title), so this is not a second guess —
  // it just gets past a URL that happens to carry no recipe data.
  for (const url of [best.url, ...(best.alternates || [])].slice(0, 3)) {
    const left = remaining()
    if (left < 800) break
    let html
    try {
      const res = await fetchWithTimeout(url, { timeout: Math.min(T_PAGE, left) })
      if (!res.ok) continue
      html = await res.text()
    } catch {
      continue
    }
    // The second independent signal. A page with no real Recipe block is not
    // confidently a recipe, so abstain rather than hand it to a model and hope.
    const recipe = jsonLdRecipe(html, url)
    if (!recipe) continue
    await rememberCreator(supabase, handle, domain, source)
    return { ok: true, recipe, url, domain, margin }
  }
  return { ok: false, reason: 'that page has no readable recipe', domain }
}
