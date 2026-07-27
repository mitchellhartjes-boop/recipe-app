// Discover Phase 2: native search results. query -> Serper (Google index,
// ~$0.3-1 per 1,000 searches) restricted per platform -> filtered to actual
// post URLs -> TikTok results enriched through the oEmbed contract (author +
// thumbnail — deliberately the platform's own sanctioned embedding interface,
// not scraped media) -> cards the app can render with one-tap import.
//
// ROLLOUT FLAGS (both default OFF, so this ships dark):
//   DISCOVER_SEARCH_ENABLED=true   master switch
//   DISCOVER_SEARCH_NATIVE=true    also serve the native app (web serves first:
//                                  real usage with zero App-Review surface, and
//                                  the review build keeps the browser-only tab)
// The flag doubles as the permanent kill switch the discovery research called
// for: if a platform or App Review ever objects, this turns off server-side
// with no app update.
import { userFromJwt } from './_lib/usage.mjs'
import { fetchPageOgImage, WEB_UA } from './_lib/extract.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const enabledFor = (ctx) => {
  if (process.env.DISCOVER_SEARCH_ENABLED !== 'true') return false
  if (ctx === 'native' && process.env.DISCOVER_SEARCH_NATIVE !== 'true') return false
  return true
}

// Which result URLs are actually a POST on each platform (not a tag page, a
// /discover/ aggregation, or a profile). Everything else from the index is noise.
const POST_PATTERNS = {
  tiktok: /tiktok\.com\/@[^/]+\/video\/\d+/i,
  instagram: /instagram\.com\/(reels?|p)\/[A-Za-z0-9_-]+/i,
  pinterest: /pinterest\.[a-z.]+\/pin\/[^/]+/i,
}

// No site: operator — Serper's entry tier rejects advanced operators with a 400
// (verified live: operator queries fail, identical plain queries succeed).
// Instead the query is biased with the platform's name and PRECISION comes from
// POST_PATTERNS below: only real post URLs on the right domain survive, so a
// stray blog result in the TikTok tab is filtered, not shown.
const SITE_QUERY = {
  tiktok: (q) => `${q} recipe tiktok`,
  instagram: (q) => `${q} recipe instagram reel`,
  pinterest: (q) => `${q} recipe pinterest`,
  web: (q) => `${q} recipe`,
}

async function serper(endpoint, query, apiKey, num = 10) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const res = await fetch(`https://google.serper.dev/${endpoint}`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num }),
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const serperSearch = async (query, apiKey) => {
  const body = await serper('search', query, apiKey)
  return Array.isArray(body?.organic) ? body.organic : []
}

// Google's IMAGE index, which solves two problems at once: every hit carries a
// thumbnail, and Pinterest pins — nearly absent from the text index's top
// results — dominate image results for recipe queries. Never throws: images are
// an enhancement, and a failure here must not kill a search that has organic hits.
const serperImages = async (query, apiKey) => {
  try {
    // 30 results, because only a fraction survive the post-URL filter — with 10,
    // a Pinterest search can come back with two pins.
    const body = await serper('images', query, apiKey, 30)
    return (Array.isArray(body?.images) ? body.images : [])
      .filter((i) => i && typeof i.link === 'string')
      .map((i) => ({
        link: i.link,
        title: typeof i.title === 'string' ? i.title : '',
        // gstatic thumbnails are small but never hotlink-blocked and never
        // expire — the right trade for a 72px card.
        thumbnail: i.thumbnailUrl || i.imageUrl || null,
      }))
  } catch {
    return []
  }
}

const normalizeKey = (url) => String(url).replace(/[?#].*$/, '').replace(/\/$/, '')

// Identity key for a post, so the same reel/video/pin matches across the text
// index, the image index, and board feeds even when hosts, slugs, or tracking
// params differ (www vs bare host, /pin/<slug>--<id> vs /pin/<id>, ?igsh=…).
const postKey = (platform, link) => {
  const s = String(link)
  let m
  if (platform === 'instagram' && (m = /instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i.exec(s))) return `ig:${m[1]}`
  if (platform === 'tiktok' && (m = /tiktok\.com\/@[^/]+\/video\/(\d+)/i.exec(s))) return `tt:${m[1]}`
  if (platform === 'pinterest' && (m = /\/pin\/(?:[^/]*?--)?(\d+)/.exec(s))) return `pin:${m[1]}`
  return normalizeKey(s)
}

// Pins from a public board via Pinterest's widgets API — the same sanctioned
// pidgets family the import path already uses to resolve pins. Boards matter
// because Google ranks BOARD pages far better than individual pins: for many
// queries the image+text indexes carry only 2-3 pin links but several boards,
// and one board feed carries ~25 pins with images. Never throws.
async function fetchBoardPins(user, board, ms) {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), ms)
    const res = await fetch(
      `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(user)}/${encodeURIComponent(board)}/pins/`,
      { headers: { 'User-Agent': WEB_UA, Accept: 'application/json' }, signal: ctl.signal },
    ).finally(() => clearTimeout(t))
    if (!res.ok) return []
    const body = await res.json()
    const pins = body?.data?.pins ?? body?.data?.[0]?.pins ?? []
    const fallbackTitle = board.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    return (Array.isArray(pins) ? pins : [])
      .map((p) => ({
        id: p?.id != null ? String(p.id) : null,
        title: (typeof p?.description === 'string' && p.description.trim().slice(0, 140)) || fallbackTitle,
        thumbnail: p?.images?.['237x']?.url ?? null,
      }))
      .filter((p) => p.id && p.thumbnail)
  } catch {
    return []
  }
}

// Board URLs are exactly two path segments (/<user>/<board-slug>/) where the
// first isn't one of Pinterest's reserved sections.
const RESERVED_PIN_PATHS = new Set([
  'pin', 'ideas', 'search', 'source', 'today', 'explore', 'videos', 'resource',
  'discover', 'topics', 'categories', 'about', 'business', 'settings', '_',
])
function boardFromUrl(link) {
  const m = /^https?:\/\/(?:[a-z]{1,3}\.)?pinterest\.[a-z.]+\/([^/?#]+)\/([^/?#]+)\/?$/i.exec(String(link))
  if (!m || RESERVED_PIN_PATHS.has(m[1].toLowerCase())) return null
  return { user: m[1], board: m[2] }
}

// TikTok's oEmbed: full caption as title, author, thumbnail — free, documented.
async function enrichTikTok(url) {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 3500)
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return null
    const j = await res.json()
    return {
      caption: typeof j.title === 'string' ? j.title : null,
      author: j.author_name ?? null,
      thumbnail: j.thumbnail_url ?? null,
    }
  } catch {
    return null
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ enabled: false, message: 'POST only' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ enabled: false, message: 'Bad body' }, 400)
  }
  const ctx = body?.ctx === 'native' ? 'native' : 'web'

  // The probe call ({probe:true}) lets the app decide browser-vs-results mode
  // once at mount instead of paying a round trip on every search.
  if (!enabledFor(ctx) || !process.env.SERPER_API_KEY) return json({ enabled: false })
  if (body?.probe) return json({ enabled: true })

  // Signed-in only — every search spends money, even if not much.
  const userId = await userFromJwt(req)
  if (!userId) return json({ enabled: true, message: 'Please sign in.', results: [] }, 401)

  const query = String(body?.query ?? '').trim().slice(0, 80)
  const REAL_PLATFORMS = ['tiktok', 'pinterest', 'instagram', 'web']
  const platform = ['all', ...REAL_PLATFORMS].includes(body?.platform) ? body.platform : 'all'
  if (!query) return json({ enabled: true, results: [] })

  const apiKey = process.env.SERPER_API_KEY

  if (platform === 'all') {
    // Fan out across every platform concurrently (8 Serper credits, ~0.3¢) and
    // interleave round-robin so the top of the feed shows all four sources.
    // One platform failing (or coming back thin) never sinks the others.
    const errors = []
    const lists = await Promise.all(
      REAL_PLATFORMS.map((p) =>
        searchPlatform(p, query, apiKey, 6).then(
          (r) => r.hits,
          (e) => {
            errors.push(e?.message || 'failed')
            return []
          },
        ),
      ),
    )
    const merged = []
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const l of lists) if (i < l.length) merged.push(l[i])
    }
    if (!merged.length && errors.length === REAL_PLATFORMS.length) {
      return json({ enabled: true, message: errors[0] || 'Search failed — try again.', results: [] }, 502)
    }
    return json({ enabled: true, results: merged })
  }

  try {
    const { hits, debug } = await searchPlatform(platform, query, apiKey, 10)
    return json({ enabled: true, results: hits, ...(body?.debug === true ? { debug } : {}) })
  } catch (e) {
    return json({ enabled: true, message: e?.message || 'Search failed — try again.', results: [] }, 502)
  }
}

// The full pipeline for one platform: text + image index -> post-URL filter ->
// image-hit promotion -> (Pinterest) board harvest -> thumbnail backfill ->
// (TikTok) oEmbed enrichment. Returns at most `limit` cards.
async function searchPlatform(platform, query, apiKey, limit) {
  const built = SITE_QUERY[platform](query)
  // Text + image index in parallel — 2 credits (~0.1¢) per platform searched.
  const [organic, images] = await Promise.all([serperSearch(built, apiKey), serperImages(built, apiKey)])

  const pattern = POST_PATTERNS[platform]
  const matches = (link) => (pattern ? pattern.test(link) : true)

  const imgHits = images.filter((i) => matches(i.link))
  const thumbByPost = new Map()
  for (const i of imgHits) {
    const key = postKey(platform, i.link)
    if (i.thumbnail && !thumbByPost.has(key)) thumbByPost.set(key, i.thumbnail)
  }

  const seen = new Set()
  const hits = organic
    .filter((r) => r && typeof r.link === 'string' && typeof r.title === 'string')
    .filter((r) => matches(r.link))
    .filter((r) => {
      const key = postKey(platform, r.link)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((r) => ({
      platform,
      url: normalizeKey(r.link),
      title: r.title.replace(/\s*\|\s*TikTok\s*$/i, '').trim(),
      snippet: typeof r.snippet === 'string' ? r.snippet : null,
      thumbnail: thumbByPost.get(postKey(platform, r.link)) ?? null,
    }))

  // Promote image-index hits the text index missed into full results. Pin
  // pages barely rank in text results, so for Pinterest this IS the recall:
  // "tacos" goes from ~1 text hit to a card list. Web stays organic-only —
  // image titles are messier than a blog's real title + snippet.
  if (platform !== 'web') {
    for (const i of imgHits) {
      if (hits.length >= limit) break
      const key = postKey(platform, i.link)
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({
        platform,
        url: normalizeKey(i.link),
        title: (i.title || query).replace(/\s*\|\s*TikTok\s*$/i, '').trim(),
        snippet: null,
        thumbnail: i.thumbnail,
      })
    }
  }

  // Pinterest recall, part two: harvest pins from the top BOARDS the search
  // surfaced (board pages rank where pin pages don't; measured live: "tacos"
  // put 2 pin links in 30 image results, while boards are all over both
  // indexes). Concurrent, bounded, and additive only up to the card cap.
  let boardDebug = null
  if (platform === 'pinterest' && hits.length < limit) {
    const boards = []
    const seenBoards = new Set()
    for (const link of [...organic.map((r) => r?.link), ...images.map((i) => i.link)]) {
      const b = typeof link === 'string' ? boardFromUrl(link) : null
      const bKey = b && `${b.user}/${b.board}`.toLowerCase()
      if (!b || seenBoards.has(bKey)) continue
      seenBoards.add(bKey)
      boards.push(b)
      if (boards.length >= 2) break
    }
    const feeds = await Promise.all(boards.map((b) => fetchBoardPins(b.user, b.board, 2500)))
    boardDebug = { boards: boards.length, boardPins: feeds.flat().length }
    for (const p of feeds.flat()) {
      if (hits.length >= limit) break
      const key = `pin:${p.id}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({
        platform,
        url: `https://www.pinterest.com/pin/${p.id}`,
        title: p.title,
        snippet: null,
        thumbnail: p.thumbnail,
      })
    }
  }

  // Blogs and pin pages rarely URL-match an image hit exactly, so thumbless
  // cards there get one og:image fetch from the page itself — concurrent,
  // 3s deadline each, and a slow or blocking page just keeps the emoji tile.
  // (Instagram is excluded: its pages login-wall plain fetches.)
  if (platform === 'web' || platform === 'pinterest') {
    const deadline = (ms) =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms)
        t.unref?.()
      })
    await Promise.all(
      hits
        .filter((h) => !h.thumbnail)
        .map(async (h) => {
          h.thumbnail = (await Promise.race([fetchPageOgImage(h.url), deadline(3000)])) ?? null
        }),
    )
  }

  // Enrich TikTok cards through oEmbed, concurrently, best-effort. A failed
  // enrichment keeps the plain text card — never drops the result.
  if (platform === 'tiktok') {
    await Promise.all(
      hits.map(async (h) => {
        const extra = await enrichTikTok(h.url)
        if (extra) {
          if (extra.caption) h.title = extra.caption.slice(0, 160)
          if (extra.author) h.author = extra.author
          if (extra.thumbnail) h.thumbnail = extra.thumbnail
        }
      }),
    )
  }

  // Counts only, opt-in — for measuring index recall from the test harness.
  return {
    hits,
    debug: { organicTotal: organic.length, imgTotal: images.length, imgMatched: imgHits.length, ...(boardDebug ?? {}) },
  }
}
