// Per-user monthly import caps.
//
// Every import spends real money — Anthropic on every path, plus Apify and Groq
// on video — so an uncapped account is an open tab. These limits bound the
// worst case per user while staying invisible to normal cooking.
//
// WHY THERE IS A SEPARATE VIDEO CAP: cost is wildly uneven. A website or caption
// import is well under a cent; a video reel is ~3-5c because it downloads the
// clip, transcribes the audio, and runs vision over frames. At $4.99/mo (~$4.24
// after Apple's 15% cut), a Pro user doing 200 mixed imports costs roughly $2-4
// — fine. The same user doing 200 VIDEO imports costs ~$8 and loses money on
// every subscription. Capping the expensive path separately keeps the headline
// number generous while making the worst case safe:
//   Pro worst case  = 40 video (~$2.00) + 160 cheap (~$1.60) = ~$3.60 < $4.24 ✓
//   Free worst case = 5 video (~$0.25) + 15 cheap (~$0.30)   = ~$0.55 per user
import { createClient } from '@supabase/supabase-js'

export const PLANS = {
  free: { imports: 10, video: 3, label: 'Free' },
  pro: { imports: 200, video: 40, label: 'Pro' },
}

export const limitsFor = (plan) => PLANS[plan] ?? PLANS.free

// Only video carries a sub-cap; the other kinds are cheap enough that the
// overall monthly limit is the only guard they need.
const kindLimit = (limits, kind) => (kind === 'video' ? limits.video : null)

export function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Resolve the signed-in user from an Authorization: Bearer <supabase jwt>. */
export async function userFromJwt(req) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

export async function planFor(admin, userId) {
  if (!admin || !userId) return 'free'
  try {
    const { data } = await admin.from('recipe_profiles').select('plan, plan_renews_at').eq('user_id', userId).maybeSingle()
    if (!data?.plan || data.plan === 'free') return 'free'
    // An expired subscription silently falls back to free rather than granting
    // Pro forever if a renewal webhook is ever missed.
    if (data.plan_renews_at && new Date(data.plan_renews_at).getTime() < Date.now()) return 'free'
    return data.plan
  } catch {
    return 'free'
  }
}

// Deny-path double-check against RevenueCat. Two jobs: close the race where a
// user subscribes and immediately imports before the webhook lands, and heal a
// missed webhook entirely. Only runs when a FREE user is about to be refused —
// i.e. almost never — so the extra REST call costs nothing in the common case.
// Any failure returns null and the original denial stands.
async function proFromRevenueCat(userId) {
  const secret = process.env.REVENUECAT_SECRET_KEY
  if (!secret) return null
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 6000)
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return null
    const body = await res.json()
    // Entitlements are keyed by their dashboard identifier ("Dilla Pro", not
    // "pro"). There is only one entitlement, so accept any that is unexpired —
    // immune to the identifier ever being renamed.
    const ents = Object.values(body?.subscriber?.entitlements ?? {})
    const expiries = ents
      .map((e) => (e?.expires_date ? new Date(e.expires_date).getTime() : NaN))
      .filter((t) => Number.isFinite(t))
    if (!expiries.length) return null
    const expires = Math.max(...expiries)
    return expires > Date.now() ? { expiresIso: new Date(expires).toISOString() } : null
  } catch {
    return null
  }
}

/**
 * Claim one import slot. Returns { allowed, used, limit, plan, reason }.
 * Fails OPEN when metering is unavailable (no service key, RPC error): a
 * billing guard should never be the reason a paying user can't save a recipe.
 */
export async function reserveImport(admin, userId, kind) {
  if (!admin || !userId) return { allowed: true, metered: false }
  let plan = await planFor(admin, userId)
  let limits = limitsFor(plan)
  const attempt = async () => {
    const { data, error } = await admin.rpc('reserve_import', {
      p_user_id: userId,
      p_kind: kind,
      p_limit: limits.imports,
      p_kind_limit: kindLimit(limits, kind),
    })
    if (error) return { allowed: true, metered: false }
    return { ...data, plan, metered: true }
  }
  try {
    let result = await attempt()
    // About to refuse a free user — make sure they aren't a Pro subscriber the
    // webhook hasn't reached yet (or was missed for). If they are, record it
    // and re-try once under the Pro limits.
    if (result.metered && !result.allowed && plan === 'free') {
      const pro = await proFromRevenueCat(userId)
      if (pro) {
        await admin.from('recipe_profiles').upsert(
          { user_id: userId, plan: 'pro', plan_renews_at: pro.expiresIso, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
        plan = 'pro'
        limits = limitsFor(plan)
        result = await attempt()
      }
    }
    return result
  } catch {
    return { allowed: true, metered: false }
  }
}

/** Give a slot back — the import produced nothing, so it shouldn't cost quota. */
export async function refundImport(admin, userId, kind) {
  if (!admin || !userId) return
  try {
    await admin.rpc('refund_import', { p_user_id: userId, p_kind: kind })
  } catch {
    /* best effort — an un-refunded slot is a minor annoyance, not a failure */
  }
}

/** What the user is told when they hit a cap. */
export function limitMessage(result) {
  const plan = result?.plan ?? 'free'
  if (result?.reason === 'kind') {
    return plan === 'free'
      ? `You've used all ${result.kind_limit} video recipes this month. Recipes from captions, websites and screenshots still work — or upgrade for more.`
      : `You've used all ${result.kind_limit} video recipes this month. Every other kind of recipe still works.`
  }
  return plan === 'free'
    // "Upgrade to Pro for 200 a month" read as a PRICE. Never put a bare number
    // after "for" in paywall copy — say what the number counts.
    ? `You've saved all ${result?.limit ?? PLANS.free.imports} recipes in your free month. Pro raises the limit to ${PLANS.pro.imports} a month.`
    : `You've hit this month's limit of ${result?.limit ?? PLANS.pro.imports} recipes. It resets at the start of next month.`
}
