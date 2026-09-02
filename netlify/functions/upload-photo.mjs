// Store a photo the USER took, and hand back a permanent URL.
//
// Every other image in Dilla is one we found — a reel cover, a blog's og:image
// — and rehostImage copies those from a source URL. This is the other case:
// a recipe typed in by hand or read off a photographed page has no cover at
// all, and the person cooking it is the only one who can supply one.
//
// POST { image: "<base64>", mediaType: "image/jpeg", hint: "chili" }
//   -> { url: "https://...supabase.co/storage/.../chili-xxx.jpg" }
//
// Auth is REQUIRED. Without it this is an open file host on someone else's
// bucket, which is a bill and an abuse channel, not a feature.
import { uploadImageBytes, appClient } from './_lib/images.mjs'
import { userFromJwt } from './_lib/usage.mjs'
import { friendlyError } from './_lib/friendlyError.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // The native app calls from capacitor://localhost, so it is cross-origin and
  // Authorization MUST be allowed here or the preflight kills every request.
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

// The client downscales to ~1568px before sending; anything much larger means
// that did not happen, and we would rather refuse than store a 10MB original.
const MAX_BASE64 = 6_000_000

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const userId = await userFromJwt(req)
  if (!userId) return json({ error: 'Sign in first.' }, 401)

  try {
    const body = await req.json()
    const raw = String(body?.image ?? '')
    // Accept a data: URL as well as bare base64 — the client sends bare, but a
    // caller pasting a data URL shouldn't get a confusing failure.
    const m = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is)
    const base64 = (m ? m[2] : raw).replace(/\s/g, '')
    const mediaType = m ? m[1].toLowerCase() : String(body?.mediaType ?? 'image/jpeg').toLowerCase()

    if (!base64) return json({ error: 'No image received.' }, 400)
    if (base64.length > MAX_BASE64) return json({ error: 'That photo is too large. Try taking it again.' }, 413)

    const url = await uploadImageBytes(await appClient(), { base64, mediaType, keyHint: body?.hint || 'photo' })
    if (!url) return json({ error: "That photo couldn't be saved. Try again." }, 502)
    return json({ url })
  } catch (e) {
    console.error('[upload-photo] failed:', e?.message)
    return json({ error: friendlyError(e?.message, "That photo couldn't be saved.") }, 502)
  }
}
