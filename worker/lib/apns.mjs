// APNs push sender — announces an async import (a video reel, a slow link-in-bio
// recovery) once it finishes, when the app is suspended and a local notification
// can no longer fire.
//
// Token-based auth (a .p8 key), not certificates: one key, no per-app cert, no
// annual expiry. No dependency either — Node signs the ES256 JWT itself, and
// with dsaEncoding 'ieee-p1363' the signature comes out in the raw R||S form
// JWT wants, sidestepping the DER→JOSE conversion that trips up hand-rolled
// APNs signing.
//
// Config (GitHub Actions secrets): APNS_KEY (.p8 contents), APNS_KEY_ID,
// APNS_TEAM_ID. Optional: APNS_BUNDLE_ID (defaults to the app id), APNS_HOST.
import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import http2 from 'node:http2'

const KEY = process.env.APNS_KEY
const KEY_ID = process.env.APNS_KEY_ID
const TEAM_ID = process.env.APNS_TEAM_ID
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.mitchellhartjes.dilla'
// TestFlight AND the App Store both use the PRODUCTION host. Sandbox is only for
// development builds installed straight from Xcode, which this pipeline never
// produces — so production is the right default and the one to override only for
// a genuine Xcode-signed debug build.
const HOST = process.env.APNS_HOST || 'https://api.push.apple.com'

export const apnsConfigured = () => Boolean(KEY && KEY_ID && TEAM_ID)

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Load the .p8. GitHub multi-line secrets keep their newlines, but tolerate a
// single-line paste with escaped \n too, since that is an easy way to mangle it.
function privateKey() {
  const pem = KEY.includes('\n') ? KEY : KEY.replace(/\\n/g, '\n')
  return createPrivateKey(pem)
}

// APNs allows reusing a provider token for up to an hour and rate-limits minting
// new ones, so cache it for the life of the (short-lived) worker process.
let cached = null
function providerToken() {
  const nowSec = Math.floor(Date.now() / 1000)
  if (cached && nowSec - cached.iat < 3000) return cached.jwt // refresh well under 60 min
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }))
  const payload = base64url(JSON.stringify({ iss: TEAM_ID, iat: nowSec }))
  const signingInput = `${header}.${payload}`
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key: privateKey(),
    dsaEncoding: 'ieee-p1363',
  })
  const jwt = `${signingInput}.${base64url(signature)}`
  cached = { jwt, iat: nowSec }
  return jwt
}

/**
 * Send one notification to one device token.
 * @returns {Promise<{ok: boolean, status: number, reason?: string, dead?: boolean}>}
 *   `dead` marks a token APNs says will never work again (uninstalled / invalid),
 *   so the caller can prune it.
 */
export async function sendPush(deviceToken, { title, body, data = {} }) {
  if (!apnsConfigured()) return { ok: false, status: 0, reason: 'apns-not-configured' }

  const payload = JSON.stringify({
    aps: { alert: { title, body }, sound: 'default' },
    ...data, // custom keys (e.g. recipe_id) travel alongside `aps` for future deep-linking
  })

  const client = http2.connect(HOST)
  // Never let a stuck connection wedge the worker.
  const guard = setTimeout(() => client.destroy(new Error('apns-timeout')), 10_000)

  try {
    return await new Promise((resolve) => {
      client.on('error', (e) => resolve({ ok: false, status: 0, reason: String(e.message) }))

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      })

      let status = 0
      let raw = ''
      req.on('response', (headers) => {
        status = Number(headers[':status']) || 0
      })
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        if (status === 200) return resolve({ ok: true, status })
        let reason = raw
        try {
          reason = JSON.parse(raw).reason || raw
        } catch {
          /* non-JSON body — keep raw */
        }
        // 410 Unregistered, or 400 BadDeviceToken, means this token is gone for
        // good — the app was uninstalled or the token was never valid.
        const dead = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered'
        resolve({ ok: false, status, reason, dead })
      })
      req.on('error', (e) => resolve({ ok: false, status: 0, reason: String(e.message) }))
      req.end(payload)
    })
  } finally {
    clearTimeout(guard)
    client.close()
  }
}
