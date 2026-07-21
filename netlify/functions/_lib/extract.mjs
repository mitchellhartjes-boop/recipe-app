// Recipe extraction core — shared by the local test harnesses and the Netlify function.
// Plain ESM, no build step. Paths:
//   - Instagram caption  -> fetchCaption + extractRecipeFromText   (fast, serverless)
//   - Generic web page   -> extractWebPage (JSON-LD aware)         (fast, serverless)
//   - Link-in-bio        -> recoverFromWeb (Claude web_search)     (slow, async/worker)
import Anthropic from '@anthropic-ai/sdk'

// Cost-optimized default for clean caption/page extraction. Override via env
// (EXTRACTION_MODEL=claude-sonnet-4-6 or claude-opus-4-8) for higher fidelity.
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || 'claude-haiku-4-5'

// Instagram serves a lightweight, pre-rendered "captioned" embed to crawlers,
// but a JS-only app-shell (caption loaded later via XHR) to normal browser UAs.
// Identifying as Googlebot gets the caption in the initial server HTML.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

// Normal browser UA for fetching generic recipe pages.
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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
    const res = await fetch(m[0], { headers: { 'User-Agent': CRAWLER_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
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

// Fetch a public reel's caption via the /embed/captioned/ endpoint (crawler UA).
export async function fetchCaption(url) {
  const shortcode = parseShortcode(url)
  const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
  const res = await fetch(embedUrl, {
    headers: { 'User-Agent': CRAWLER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`Instagram embed fetch failed (HTTP ${res.status})`)
  const html = await res.text()
  const text = htmlToText(html).slice(0, 8000)
  const imageUrl = (await fetchReelCover(html)) || extractOgImage(html)
  const looksWalled = /log in|sign up to see/i.test(text) && text.length < 400
  // For private / audience-restricted / removed reels, Instagram serves anonymous requests a
  // "broken or removed" stub (or a login wall) instead of the caption. Detect that so callers can
  // tell the user it's restricted rather than misrouting it to a video/link-in-bio job that fails.
  const WALL =
    /(this (?:photo|video) may be broken|post may have been removed|content isn'?t available|isn'?t available to everyone|page isn'?t available|log in to see|sign up to see this)/i
  const inaccessible = text.length < 40 || (WALL.test(text) && text.length < 700)
  return { shortcode, embedUrl, text, imageUrl, looksWalled, inaccessible }
}

// Shared JSON contract for all extractors (text + vision) so they return the
// same recipe shape. `photo_query` powers the stock-photo cover fallback.
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
  "photo_query": string|null,     // 2-5 word stock-photo search for a representative photo of the finished dish/drink (the dish itself; NO @handles/brands), e.g. "old fashioned whiskey cocktail", "creamy cajun pasta"
  "external_url": string|null,    // a recipe/blog URL if one appears (e.g. "recipe on my blog: ...")
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
export async function extractRecipeFromImage({ base64, mediaType, apiKey }) {
  const type = VISION_MEDIA.has(mediaType) ? mediaType : 'image/jpeg'
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 3000,
    system: VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type, data: base64 } },
          { type: 'text', text: 'Extract the recipe from this image as the specified JSON.' },
        ],
      },
    ],
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
  const { embedUrl, text, imageUrl, looksWalled, inaccessible, shortcode } = await fetchCaption(url)
  if (inaccessible || looksWalled) {
    return {
      source_platform: 'instagram',
      source_url: url,
      shortcode,
      embedUrl,
      imageUrl,
      captionChars: text.length,
      inaccessible: true,
      recipe: { found: false, notes_for_user: 'Instagram would not show this reel without logging in — it looks private or audience-restricted.' },
    }
  }
  const { recipe, model, usage } = await extractRecipeFromText({ text, sourceUrl: url, apiKey })
  return { source_platform: 'instagram', source_url: url, shortcode, embedUrl, imageUrl, captionChars: text.length, model, usage, recipe }
}

// Generic recipe web page: fetch -> JSON-LD + visible text -> Claude.
export async function extractWebPage({ url, apiKey }) {
  const res = await fetch(url, { headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (!res.ok) throw new Error(`Web page fetch failed (HTTP ${res.status})`)
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
