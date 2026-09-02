// Recipe extraction core — shared by the local test harnesses and the Netlify function.
// Plain ESM, no build step. Paths:
//   - Instagram caption  -> fetchCaption + extractRecipeFromText   (fast, serverless)
//   - Generic web page   -> extractWebPage (JSON-LD aware)         (fast, serverless)
//   - Link-in-bio        -> recoverFromWeb (Claude web_search)     (slow, async/worker)
import Anthropic from '@anthropic-ai/sdk'
import { fetchViaProxy, proxyConfigured, BLOCKED_STATUSES } from './proxyFetch.mjs'

// Cost-optimized default for clean caption/page extraction. Override via env
// (EXTRACTION_MODEL=claude-sonnet-4-6 or claude-opus-4-8) for higher fidelity.
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || 'claude-haiku-4-5'

// Our own honest, identifying User-Agent for the public Instagram embed fetch.
//
// We deliberately do NOT impersonate Googlebot here. Instagram serves the
// pre-rendered "captioned" embed to search crawlers and a JS-only shell to
// others, so a spoofed crawler UA yields more content — but spoofing is
// impersonation to defeat a server-side access decision, it can't be described
// honestly in an App Store review note (Guideline 5.2.2 asks you to show you're
// permitted to access a third-party service), and it's detectable via reverse
// DNS. We identify ourselves, fetch the same public URL the user just shared,
// once per explicit user action, at human rates. If the embed returns no
// caption we fall through to the other paths (screenshot / website / video).
const EMBED_UA =
  process.env.EMBED_USER_AGENT ||
  'DillaBot/1.0 (+https://recipe-vault-mh.netlify.app/bot; recipe import on behalf of a user)'

// Server-side kill switch for the Instagram embed path. If Meta ever objects,
// set INSTAGRAM_EMBED_ENABLED=false in the Netlify env — no redeploy of the
// native app, no App Store resubmission. Callers fall back to asking the user
// for a screenshot, which needs no third-party access at all.
export const instagramEmbedEnabled = () => process.env.INSTAGRAM_EMBED_ENABLED !== 'false'

// Normal browser UA for fetching generic recipe pages.
// MAINTENANCE: bump the Chrome version roughly yearly. Publishers' bot shields
// reject STALE Chrome versions — verified on thekitchn.com 2026-08-30, where
// Chrome/124 returned 403 and Chrome/140 returned 200 from the same IP with
// otherwise identical headers. When "site blocks us" reports cluster on big
// recipe publishers, check this first: it looks like an IP block and isn't.
export const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

export function parseShortcode(url) {
  const m = String(url).match(/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i)
  if (!m) throw new Error(`Not a recognizable Instagram URL: ${url}`)
  return m[1]
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function extractOgImage(html) {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  return m ? decodeEntities(m[1]) : null
}

// The reliable reel cover. The captioned-embed's own <img> tags are the author avatar + SUGGESTED
// posts from the creator — so picking the "largest" once grabbed a random other reel's thumbnail.
// The actual cover is the og:image of the lookaside "crawler" page, which is keyed by THIS reel's
// media_id. Fetch that page and read its og:image. One extra lightweight request; never throws.
// (CDN URLs expire — re-host the result, see images.mjs.)
async function fetchReelCover(html) {
  try {
    const m = html.match(/https:\/\/lookaside\.instagram\.com\/seo\/google_widget\/crawler\/\?media_id=\d+/i)
    if (!m) return null
    const res = await fetch(m[0], { headers: { 'User-Agent': EMBED_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
    if (!res.ok) return null
    return extractOgImage(await res.text())
  } catch {
    return null
  }
}

// Pull any schema.org JSON-LD blocks (recipe sites embed the recipe card here).
function extractJsonLd(html) {
  const blocks = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null && blocks.length < 6) blocks.push(m[1].trim())
  return blocks.join('\n').slice(0, 12000)
}

// Fetch a public reel's caption via the public /embed/captioned/ endpoint —
// the same URL the user just shared, fetched once, logged out, with our own
// identifying UA. Honors the INSTAGRAM_EMBED_ENABLED kill switch.
export async function fetchCaption(url) {
  const shortcode = parseShortcode(url)
  if (!instagramEmbedEnabled()) {
    return {
      shortcode,
      embedUrl: null,
      text: '',
      imageUrl: null,
      looksWalled: false,
      inaccessible: true,
      disabled: true,
    }
  }
  const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
  const res = await fetch(embedUrl, {
    headers: { 'User-Agent': EMBED_UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`Instagram embed fetch failed (HTTP ${res.status})`)
  const html = await res.text()
  const text = htmlToText(html).slice(0, 8000)
  const imageUrl = (await fetchReelCover(html)) || extractOgImage(html)
  // The creator's @handle, needed to find their blog when the caption only says
  // "recipe in bio". Taken from the markup rather than from the model's
  // source_author, which is a guess and often returns a person's real name
  // ("bailey rhatigan") instead of the handle. Two independent patterns, both
  // verified against live reels.
  const handle =
    /class="[^"]*UsernameText[^"]*">([A-Za-z0-9._]{2,30})</.exec(html)?.[1] ??
    /instagram\.com\/([A-Za-z0-9._]{2,30})\/(?:\?|"|')/.exec(html)?.[1] ??
    null
  const looksWalled = /log in|sign up to see/i.test(text) && text.length < 400
  // For private / audience-restricted / removed reels, Instagram serves anonymous requests a
  // "broken or removed" stub (or a login wall) instead of the caption. Detect that so callers can
  // tell the user it's restricted rather than misrouting it to a video/link-in-bio job that fails.
  const WALL =
    /(this (?:photo|video) may be broken|post may have been removed|content isn'?t available|isn'?t available to everyone|page isn'?t available|log in to see|sign up to see this)/i
  const inaccessible = text.length < 40 || (WALL.test(text) && text.length < 700)
  return { shortcode, embedUrl, text, imageUrl, handle, looksWalled, inaccessible }
}

// Shared JSON contract for all extractors (text + vision) so they return the
// same recipe shape.
const SCHEMA_BLOCK = `Respond with ONLY a JSON object (no prose, no markdown code fences) matching exactly:
{
  "found": boolean,              // true ONLY if there's an actual recipe (ingredients and/or steps)
  "title": string|null,
  "description": string|null,    // one short summary sentence, if available
  "source_author": string|null,  // the creator's @handle or name if visible
  "servings": string|null,
  "prep_minutes": number|null,
  "cook_minutes": number|null,
  "total_minutes": number|null,
  "ingredients": [ { "raw": string, "quantity": string|null, "unit": string|null, "item": string|null, "section": string|null } ],
  "steps": [ string ],            // ordered instruction steps, cleaned of emoji clutter
  "tags": [ string ],             // lowercase, e.g. ["dinner","pasta","cajun"]
  "external_url": string|null,    // a recipe/blog URL if one appears (e.g. "recipe on my blog: ...")
  "creator_domain": string|null,  // just the site's domain if the text names one WITHOUT a full URL
                                  // (e.g. "full recipe on halfbakedharvest.com" -> "halfbakedharvest.com").
                                  // Bare domain only, no scheme or path. null if none is named.
  "where_is_recipe": "caption"|"external_link"|"video"|"unknown",  // see below — drives how we fetch it
  "notes_for_user": string|null   // when found=false, a short reason, e.g. "Recipe is demonstrated in the video, not written in the caption"
}
Parse quantities into raw + structured parts where you can ("2 cups flour" -> quantity "2", unit "cup", item "flour"); always keep the original line in "raw". If there is no real recipe, set found=false, fill notes_for_user, and still capture title/source_author/external_url if visible.

INGREDIENT SECTIONS: when a recipe splits its ingredients into named parts — e.g. "For the dressing", "For the salad", "Sauce:", "Marinade", "Topping", "Cake / Frosting" — set each ingredient's "section" to that short part name (e.g. "Dressing", "Salad"). Use the recipe's own headings; keep names short (1-2 words, Title Case), no "for the" prefix. If the recipe is a single flat list with no parts, set "section" to null for every ingredient. Only create sections the recipe actually indicates — never invent them.`

const WHERE_BLOCK = `Set "where_is_recipe" to where the actual recipe lives:
- "caption": the full recipe (ingredients/steps) is written here in the text (this is the found=true case).
- "external_link": the text points to the recipe on a website/blog or says "link in bio / recipe on my blog / full recipe at ..." — i.e. it lives on another page. Capture external_url if a URL is visible.
- "video": there is NO recipe and NO external recipe link — the caption only names/teases the dish (e.g. "save this!", dish name + emojis) and the recipe is demonstrated or spoken in the VIDEO itself.
- "unknown": you genuinely can't tell. When unsure between "video" and "external_link", prefer "video" unless the caption clearly references a blog/website/bio link.`

const SYSTEM_PROMPT = `You extract structured recipes from web/social text (Instagram captions, recipe blog pages, etc.). The text may include site chrome ("Log in", "Sign up", nav, ads, JSON-LD) — use whatever is useful and ignore the rest.

${SCHEMA_BLOCK}

${WHERE_BLOCK}`

const VISION_SYSTEM_PROMPT = `You extract a structured recipe from an IMAGE — usually a phone screenshot of an Instagram reel/post (it may show on-screen recipe text, the caption beneath the video, plus app chrome, the status bar, and like/comment buttons) or a photo of a printed/handwritten recipe. Read ALL legible text and any on-screen quantities; ignore app UI, navigation, timestamps, and unrelated chrome.

${SCHEMA_BLOCK}

The recipe is in the image itself, so set "where_is_recipe" to "caption" when found=true. Only set "external_url" if a recipe URL is actually visible in the image.`

function stripFences(s) {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export async function extractRecipeFromText({ text, sourceUrl, apiKey }) {
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Source URL: ${sourceUrl}\n\nText:\n"""\n${text}\n"""` }],
  })
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let recipe
  try {
    recipe = JSON.parse(stripFences(raw))
  } catch {
    throw new Error(`Model did not return valid JSON: ${raw.slice(0, 200)}`)
  }
  return { recipe, model: EXTRACTION_MODEL, usage: msg.usage }
}

// Vision model for reading recipes off a screenshot/photo. Haiku is weak at
// dense screenshot OCR; Sonnet matches the video-frame vision path. Overridable.
const VISION_MODEL = process.env.VISION_MODEL || 'claude-sonnet-4-6'
const VISION_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Extract a recipe from an image (base64). Used by the share endpoint's
// screenshot path — the way to capture audience-restricted / age-gated reels
// (e.g. cocktails) that no anonymous fetch can read. Returns the same shape as
// the text extractors.
export async function extractRecipeFromImage({ base64, mediaType, images, apiKey }) {
  // Accepts EITHER one image (base64 + mediaType, the original shape every
  // existing caller uses) or several via `images`. Multiple matters because a
  // long recipe does not fit in one photo: the ingredients are on one page and
  // the method runs onto the next, and photographing only what fits produced a
  // confidently half-finished recipe rather than an obvious failure.
  const pages = (images?.length ? images : [{ base64, mediaType }])
    .filter((p) => p?.base64)
    .map((p) => ({ base64: p.base64, type: VISION_MEDIA.has(p.mediaType) ? p.mediaType : 'image/jpeg' }))
  if (!pages.length) throw new Error('No image to read.')

  const client = new Anthropic({ apiKey })
  const content = []
  pages.forEach((p, i) => {
    // Label each page. Unlabelled images invite the model to treat a second
    // photo as a SECOND recipe; numbering them says these are one document.
    if (pages.length > 1) content.push({ type: 'text', text: `Page ${i + 1} of ${pages.length}:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: p.type, data: p.base64 } })
  })
  content.push({
    type: 'text',
    text:
      pages.length > 1
        ? `These ${pages.length} images are pages of ONE recipe, in order. Combine them into a single recipe: ingredients may be on one page and the method on another, and a list may continue across a page break. Do not repeat an ingredient or step that appears on two pages. Respond with the specified JSON.`
        : 'Extract the recipe from this image as the specified JSON.',
  })

  const msg = await client.messages.create({
    model: VISION_MODEL,
    // More pages means a longer recipe to write out; a fixed 3000 truncated
    // exactly the multi-page recipes this feature exists to capture.
    max_tokens: pages.length > 1 ? 6000 : 3000,
    system: VISION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let recipe
  try {
    recipe = JSON.parse(stripFences(raw))
  } catch {
    throw new Error(`Vision model did not return valid JSON: ${raw.slice(0, 200)}`)
  }
  return { recipe, model: VISION_MODEL, usage: msg.usage }
}

export async function extractReel(url, { apiKey } = {}) {
  const { embedUrl, text, imageUrl, handle, looksWalled, inaccessible, shortcode, disabled } = await fetchCaption(url)
  if (inaccessible || looksWalled) {
    // Point the user at the screenshot path: it needs no third-party access at
    // all, and it reads restricted/age-gated reels the public embed can't.
    return {
      source_platform: 'instagram',
      source_url: url,
      shortcode,
      embedUrl,
      imageUrl,
      captionChars: text.length,
      inaccessible: true,
      recipe: {
        found: false,
        notes_for_user: disabled
          ? 'Link importing from Instagram is turned off right now. Screenshot the recipe and share the image instead — that works for any reel.'
          : "Instagram didn't return this reel's caption — it may be private, age-restricted, or the recipe may only be in the video. Screenshot the recipe and share the image instead; that works for any reel.",
      },
    }
  }
  const { recipe, model, usage } = await extractRecipeFromText({ text, sourceUrl: url, apiKey })
  return { source_platform: 'instagram', source_url: url, shortcode, embedUrl, imageUrl, handle, captionChars: text.length, model, usage, recipe }
}

// Generic recipe web page: fetch -> JSON-LD + visible text -> Claude.
// ---- Pinterest ------------------------------------------------------------
// A pin page cannot be read server-side: Pinterest returns a ~1.1MB JavaScript
// shell behind bot detection, with no og: tags, no recipe text, and no trace of
// the pin's destination (verified against live pins). Its PUBLIC WIDGET
// endpoint, though, returns the pin as JSON — including `link`, the page the pin
// actually points at. Resolve that and the ordinary website path takes over, so
// a Pinterest recipe imports exactly like sharing the blog directly.
const PIN_INFO = 'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids='

// Handles both /pin/<id>/ and the slug form /pin/<words>--<id>/.
export function pinterestPinId(url) {
  const m = String(url ?? '').match(/\/pin\/(?:[^/]*?--)?(\d+)/)
  return m ? m[1] : null
}

// -> { link, description } | null. `link` is null for pins that are just an
// uploaded image or video with nothing to click through to.
export async function resolvePinterestLink(url) {
  let target = String(url ?? '')
  // pin.it is the short link the iOS share sheet produces; it carries no pin id,
  // so it has to be expanded before the widget endpoint can be queried.
  if (/^https?:\/\/(www\.)?pin\.it\//i.test(target)) {
    try {
      const res = await fetch(target, { headers: { 'User-Agent': WEB_UA }, redirect: 'follow' })
      target = res.url || target
    } catch {
      /* fall through — the id extraction below just fails and we return null */
    }
  }
  const id = pinterestPinId(target)
  if (!id) return null
  try {
    const res = await fetch(PIN_INFO + encodeURIComponent(id), {
      headers: { 'User-Agent': WEB_UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const pin = (await res.json())?.data?.[0]
    if (!pin) return null
    const link = typeof pin.link === 'string' && /^https?:\/\//i.test(pin.link) ? pin.link : null
    return { link, description: typeof pin.description === 'string' ? pin.description : null }
  } catch {
    return null
  }
}

// Statuses that mean "a bot shield answered", not "this page is broken". Big
// recipe publishers (Dotdash Meredith sites answer 402, Cloudflare ones 403)
// serve these to any server-side fetch no matter how honest the User-Agent is,
// so the caller should tell the user to screenshot rather than report an error.
// BLOCKED_STATUSES now lives with the proxy fallback that consumes it.

/**
 * Fetch a page, and if a bot shield answers, try once more from a residential
 * IP. The retry is what makes allrecipes/Serious Eats/Food Network work at all
 * from our servers — see proxyFetch.mjs for the measurements.
 *
 * If the proxy isn't configured, or it also fails, we throw exactly the error
 * we always threw, so every caller's blocked-site handling still applies.
 */
async function fetchPageAllowingBlocked(url) {
  const headers = { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' }
  let res
  try {
    res = await fetch(url, { headers })
  } catch (e) {
    // A transport-level failure is not a bot shield; don't spend proxy bytes.
    throw e
  }
  if (res.ok || !BLOCKED_STATUSES.has(res.status) || !proxyConfigured()) return res

  const direct = res.status
  try {
    const viaProxy = await fetchViaProxy(url, { headers })
    if (viaProxy.ok) {
      console.info(`[extract] ${new URL(url).hostname} refused us (${direct}); residential proxy got ${viaProxy.status}`)
      return viaProxy
    }
    // Blocked through the proxy too — report the ORIGINAL status, since that is
    // the one that describes our normal path.
    console.warn(`[extract] ${new URL(url).hostname} blocked direct (${direct}) AND via proxy (${viaProxy.status})`)
    return res
  } catch (e) {
    console.warn(`[extract] proxy retry failed for ${url}: ${e.message}`)
    return res
  }
}

export async function extractWebPage({ url, apiKey }) {
  const res = await fetchPageAllowingBlocked(url)
  if (!res.ok) {
    const err = new Error(`Web page fetch failed (HTTP ${res.status})`)
    err.status = res.status
    err.blocked = BLOCKED_STATUSES.has(res.status)
    throw err
  }
  const html = await res.text()
  const imageUrl = extractOgImage(html)
  const jsonLd = extractJsonLd(html)
  const visible = htmlToText(html).slice(0, 8000)
  const text = (jsonLd ? `Structured data (JSON-LD):\n${jsonLd}\n\n` : '') + `Page text:\n${visible}`
  const { recipe, model, usage } = await extractRecipeFromText({ text, sourceUrl: url, apiKey })
  return { source_platform: 'web', source_url: url, imageUrl, model, usage, recipe }
}

// Lightweight cover-image fetch for a generic page (og:image only, no Claude). Used by the
// worker to give link-in-bio recipes a thumbnail from the recovered blog page. Never throws.
export async function fetchPageOgImage(url) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return null
    const res = await fetch(url, { headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
    if (!res.ok) return null
    return extractOgImage(await res.text())
  } catch {
    return null
  }
}

// ---- Link-in-bio recovery (slow: uses Claude's web_search; run async/worker) ----
const RECOVERY_MODEL = process.env.RECOVERY_MODEL || 'claude-sonnet-4-6'

const RECOVERY_SYSTEM = `You recover a full cooking recipe that an Instagram creator referenced but did NOT write out in the caption (they said "recipe in bio / on my blog"). You have a web_search tool.

Approach: search for the dish by that specific creator, prefer their OWN website/blog over recipe aggregators, and extract the full recipe from the best matching page (prefer the page's structured recipe data / recipe card).

When done, reply with ONLY a JSON object (no prose, no markdown fences):
{
  "found": boolean,
  "source_url": string|null,
  "title": string|null,
  "description": string|null,
  "source_author": string|null,
  "servings": string|null,
  "prep_minutes": number|null,
  "cook_minutes": number|null,
  "total_minutes": number|null,
  "ingredients": [ { "raw": string, "quantity": string|null, "unit": string|null, "item": string|null } ],
  "steps": [ string ],
  "tags": [ string ],
  "notes": string|null
}
If you cannot confidently find the creator's own recipe, set found=false with a short note. Do not fabricate quantities.`

export async function recoverFromWeb({ title, author, sourceUrl, externalUrl, apiKey }) {
  // web_search turns can take minutes; the SDK's default request timeout can trip with
  // "Request timed out". Give it generous room and a couple of retries.
  const client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000, maxRetries: 2 })
  const hint = externalUrl ? `\n- Link found in the caption (likely the recipe): ${externalUrl}` : ''
  const messages = [
    {
      role: 'user',
      content: `Recover this Instagram recipe:\n- Dish: ${title}\n- Creator: @${author}\n- Reel: ${sourceUrl}${hint}\n\nThe full recipe lives on the creator's website. Find it and extract it.`,
    },
  ]

  let resp
  for (let i = 0; i < 4; i++) {
    resp = await client.messages.create({
      model: RECOVERY_MODEL,
      max_tokens: 3000,
      system: RECOVERY_SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages,
    })
    if (resp.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: resp.content })
  }

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  const cleaned = stripFences(text)
  let recipe
  try {
    recipe = JSON.parse(cleaned)
  } catch {
    const i = cleaned.indexOf('{')
    const j = cleaned.lastIndexOf('}')
    if (i >= 0 && j > i) recipe = JSON.parse(cleaned.slice(i, j + 1))
    else throw new Error(`Recovery returned no JSON: ${text.slice(0, 200)}`)
  }
  return { recipe, model: RECOVERY_MODEL, usage: resp.usage, stop_reason: resp.stop_reason }
}

// Repair a URL the caption extractor handed back before anything tries to fetch
// it. Haiku is inconsistent about schemes — it returns "www.site.com/recipe" as
// readily as a full URL, and fetch() throws a raw TypeError on the bare form.
// Also unwraps Instagram's l.instagram.com redirector and strips tracking params.
// Returns null when the string isn't host-shaped at all.
export function normalizeUrl(raw) {
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

