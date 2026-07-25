// TikTok ingestion: caption-first, video as the fallback — the same shape as
// Instagram, but with friendlier plumbing. Verified against live posts:
//
//  - TikTok's documented oEmbed endpoint returns the FULL caption untruncated
//    (tested to 1,952 chars), plus author and thumbnail. Free, no auth, and the
//    caption very often IS the whole recipe — TikTok recipe culture writes the
//    ingredient list right into the description.
//  - The watch page itself embeds the same data as JSON
//    (__UNIVERSAL_DATA_FOR_REHYDRATION__) and, unlike Instagram, served it to a
//    plain server-side fetch in testing — kept as the fallback when oEmbed
//    declines.
//  - Video-only posts go to the worker, which pulls the file via Apify. TikTok
//    even ships its own WebVTT subtitles, which the worker uses instead of a
//    paid transcription pass (see fetchTikTokViaApify / video.mjs).
import { WEB_UA } from './extract.mjs'

export function isTikTokUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || /(^|\.)tiktok\.com$/.test(host)
  } catch {
    return false
  }
}

const isShortLink = (url) => {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || /^\/t\//.test(u.pathname)
  } catch {
    return false
  }
}

// The iOS share sheet hands out vm.tiktok.com/… short links, not the canonical
// /@user/video/<id> URL. Expand by following the redirect chain.
export async function expandTikTokUrl(url, { timeoutMs = 6000 } = {}) {
  if (!isShortLink(url)) return url
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    // Strip tracking params from the landing URL before it gets stored anywhere.
    const landed = new URL(res.url || url)
    landed.search = ''
    return landed.toString()
  } catch {
    return url
  } finally {
    clearTimeout(timer)
  }
}

const handleFromUrl = (url) => /tiktok\.com\/@([A-Za-z0-9._]{2,24})/.exec(String(url ?? ''))?.[1] ?? null

/**
 * Read a TikTok post's caption + author + cover, server-side, for free.
 * -> { canonicalUrl, caption, author, authorName, imageUrl, inaccessible }
 */
export async function fetchTikTokPost(url) {
  const canonicalUrl = await expandTikTokUrl(url)

  // Primary: the documented oEmbed endpoint.
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, {
      headers: { 'User-Agent': WEB_UA, Accept: 'application/json' },
    })
    if (res.ok) {
      const j = await res.json()
      if (j && typeof j.title === 'string') {
        return {
          canonicalUrl,
          caption: j.title,
          author: handleFromUrl(j.author_url) ?? handleFromUrl(canonicalUrl),
          authorName: j.author_name ?? null,
          imageUrl: j.thumbnail_url ?? null,
          inaccessible: false,
        }
      }
    }
  } catch {
    /* fall through to the page fetch */
  }

  // Fallback: the watch page's embedded JSON.
  try {
    const res = await fetch(canonicalUrl, {
      headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (res.ok) {
      const html = await res.text()
      const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
      if (m) {
        const item = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
        if (item) {
          return {
            canonicalUrl,
            caption: item.desc ?? '',
            author: item.author?.uniqueId ?? handleFromUrl(canonicalUrl),
            authorName: item.author?.nickname ?? null,
            imageUrl: item.video?.cover ?? null,
            inaccessible: false,
          }
        }
      }
    }
  } catch {
    /* fall through to inaccessible */
  }

  // Private, removed, region-locked — nothing an anonymous fetch can read.
  return { canonicalUrl, caption: '', author: handleFromUrl(canonicalUrl), authorName: null, imageUrl: null, inaccessible: true }
}

/** WebVTT -> plain transcript text (TikTok's own subtitles, fetched by the worker). */
export function vttToText(vtt) {
  return String(vtt ?? '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t || t === 'WEBVTT') return false
      if (/^\d+$/.test(t)) return false // cue numbers
      if (/-->/.test(t)) return false // timestamps
      if (/^(NOTE|STYLE|REGION)\b/.test(t)) return false
      return true
    })
    .map((l) => l.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
