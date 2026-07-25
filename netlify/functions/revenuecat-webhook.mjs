// RevenueCat -> Dilla: the ONE place a subscription changes a user's plan.
//
// RevenueCat calls this on every subscription event (purchase, renewal,
// cancellation, expiry, billing issue). The rule reduces to a single question:
// does the entitlement expire in the future? Future -> pro until then; past ->
// free. That makes every event idempotent and self-correcting — a CANCELLATION
// keeps Pro until the period the user already paid for runs out (plan_renews_at
// does the reverting, see planFor in _lib/usage.mjs), and a missed event heals
// on the next one.
//
// Auth: RevenueCat sends a verbatim Authorization header configured in its
// dashboard; it must equal REVENUECAT_WEBHOOK_SECRET. Requests without it are
// rejected — this endpoint can grant Pro, so it is not guessable-URL security.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function secretMatches(provided, expected) {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(String(provided)).digest()
  const b = createHash('sha256').update(String(expected)).digest()
  return timingSafeEqual(a, b)
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405)

  const expected = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!expected) return json({ ok: false, message: 'Webhook secret not configured' }, 500)
  if (!secretMatches(req.headers.get('authorization'), expected)) {
    return json({ ok: false }, 401)
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return json({ ok: false, message: 'Server missing Supabase config' }, 500)

  let event
  try {
    ;({ event } = await req.json())
  } catch {
    return json({ ok: false, message: 'Bad body' }, 400)
  }
  if (!event) return json({ ok: true, skipped: 'no event' })

  // The app configures RevenueCat with the Supabase user id as app_user_id, so
  // anything else (RC anonymous ids, test pings) is acknowledged and ignored —
  // returning non-200 would just make RevenueCat retry something unprocessable.
  const userId = String(event.app_user_id ?? '')
  if (!UUID.test(userId)) return json({ ok: true, skipped: 'not a user id' })

  const expiresMs = Number(event.expiration_at_ms ?? 0)
  if (!expiresMs) return json({ ok: true, skipped: 'no expiration in event' })

  const pro = expiresMs > Date.now()
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.from('recipe_profiles').upsert(
    {
      user_id: userId,
      plan: pro ? 'pro' : 'free',
      plan_renews_at: new Date(expiresMs).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return json({ ok: false, message: error.message }, 500)

  return json({ ok: true, plan: pro ? 'pro' : 'free', type: event.type ?? 'unknown' })
}
