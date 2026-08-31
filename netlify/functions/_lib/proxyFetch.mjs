// Residential-proxy fallback for publishers that refuse datacenter IPs.
//
// WHY THIS EXISTS: measured 2026-08-30 from Netlify's own IP, with a current
// Chrome User-Agent, five of the biggest US recipe sites refused us outright —
// allrecipes (402), Serious Eats (402), Simply Recipes (402), Food Network
// (403), The Kitchn (403). The same URLs return 200 from a residential IP with
// identical headers, so it is the IP being judged, not us. That is a large hole
// in "share any recipe blog", and it is invisible: the user just sees a site
// that "doesn't work".
//
// Apify's residential proxy is the fix, and we already pay for Apify for
// Instagram and TikTok. We ask for the HTML document only — no JavaScript, no
// images, no assets — so a page costs well under half a cent of bandwidth
// against the ~1c the extraction itself already spends.
//
// DELIBERATELY a FALLBACK, never the default path: direct fetches are free and
// work for most sites, so we only pay when a site actually turns us away.
import { ProxyAgent, fetch as undiciFetch } from 'undici'

const PROXY_HOST = 'proxy.apify.com'
const PROXY_PORT = 8000

/** Statuses that mean "a bot shield answered", not "the page isn't there".
 *  404 is deliberately NOT here: a real 404 is a wrong URL, and retrying it
 *  through a paid proxy would spend money to fail identically. */
export const BLOCKED_STATUSES = new Set([401, 402, 403, 406, 429, 451])

export const proxyConfigured = () => Boolean(process.env.APIFY_PROXY_PASSWORD)

let agent = null
function proxyAgent() {
  if (agent) return agent
  const password = process.env.APIFY_PROXY_PASSWORD
  if (!password) return null
  // country-US because these are US publishers; a US exit IP looks like their
  // actual readership and is less likely to be challenged than a random one.
  const user = encodeURIComponent('groups-RESIDENTIAL,country-US')
  agent = new ProxyAgent(`http://${user}:${encodeURIComponent(password)}@${PROXY_HOST}:${PROXY_PORT}`)
  return agent
}

/**
 * Fetch a page through the residential proxy. Returns a normal Response.
 * Throws if the proxy isn't configured — callers should check proxyConfigured()
 * first so a missing password degrades to today's behaviour instead of erroring.
 */
export async function fetchViaProxy(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const dispatcher = proxyAgent()
  if (!dispatcher) throw new Error('APIFY_PROXY_PASSWORD is not set')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await undiciFetch(url, { headers, dispatcher, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
