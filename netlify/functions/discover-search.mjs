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

const SITE_QUERY = {
  tiktok: (q) => `site:tiktok.com ${q} recipe`,
  instagram: (q) => `site:instagram.com ${q} recipe`,
  pinterest: (q) => `site:pinterest.com/pin ${q} recipe`,
  web: (q) => `${q} recipe`,
}

async function serperSearch(query, apiKey) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 20 }),
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`)
    const body = await res.json()
    return Array.isArray(body?.organic) ? body.organic : []
  } finally {
    clearTimeout(timer)
  }
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
  const platform = ['tiktok', 'instagram', 'pinterest', 'web'].includes(body?.platform) ? body.platform : 'tiktok'
  if (!query) return json({ enabled: true, results: [] })

  try {
    const organic = await serperSearch(SITE_QUERY[platform](query), process.env.SERPER_API_KEY)

    const pattern = POST_PATTERNS[platform]
    const seen = new Set()
    const hits = organic
      .filter((r) => r && typeof r.link === 'string' && typeof r.title === 'string')
      .filter((r) => (pattern ? pattern.test(r.link) : true))
      .filter((r) => {
        const key = r.link.replace(/[?#].*$/, '')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
      .map((r) => ({
        platform,
        url: r.link.replace(/[?#].*$/, ''),
        title: r.title.replace(/\s*\|\s*TikTok\s*$/i, '').trim(),
        snippet: typeof r.snippet === 'string' ? r.snippet : null,
      }))

    // Enrich TikTok cards through oEmbed, concurrently, best-effort. A failed
    // enrichment keeps the plain text card — never drops the result.
    if (platform === 'tiktok') {
      await Promise.all(
        hits.map(async (h) => {
          const extra = await enrichTikTok(h.url)
          if (extra) {
            if (extra.caption) h.title = extra.caption.slice(0, 160)
            h.author = extra.author
            h.thumbnail = extra.thumbnail
          }
        }),
      )
    }

    return json({ enabled: true, results: hits })
  } catch (e) {
    return json({ enabled: true, message: e?.message || 'Search failed — try again.', results: [] }, 502)
  }
}
