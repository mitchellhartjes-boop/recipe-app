// Apify Instagram Scraper client. Apify reads Instagram as a maintained, logged-in service
// (their accounts + proxies), returning a reel's caption, cover image, and a DIRECT video URL.
// We use it for the video/audio path: the direct video URL is a plain CDN link, so the cloud
// worker can download + process it always-on — no local PC, no yt-dlp, no datacenter-IP block.
//
// Note: Apify can read PUBLIC reels, but NOT audience-restricted ones (its accounts aren't in the
// allowed audience) — those come back as { error: 'restricted_page' } and we surface that clearly.
const ACTOR = 'apify~instagram-scraper'

// Run the actor synchronously for one reel and return the normalized fields we use.
// Throws with a clear message on restriction / no-data / HTTP errors.
export async function fetchReelViaApify(url, token, { timeoutMs = 120000 } = {}) {
  if (!token) throw new Error('APIFY_TOKEN is not set')
  const endpoint = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const input = { directUrls: [url], resultsType: 'details', resultsLimit: 1, addParentData: false }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let body
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Apify run failed (HTTP ${res.status})`)
    body = await res.json()
  } finally {
    clearTimeout(timer)
  }

  const item = Array.isArray(body) ? body[0] : null
  if (!item) throw new Error('Apify returned no data for this reel')
  if (item.error) {
    // e.g. error:'restricted_page', errorDescription:'Restricted access, only partial data available'
    const restricted = /restricted/i.test(item.error)
    throw new Error(restricted ? 'This reel is audience-restricted — only your own Instagram login can read it.' : `Apify: ${item.errorDescription || item.error}`)
  }
  return {
    caption: item.caption || '',
    videoUrl: item.videoUrl || null,
    imageUrl: item.displayUrl || null,
    author: item.ownerUsername || null,
    type: item.type || null,
  }
}
