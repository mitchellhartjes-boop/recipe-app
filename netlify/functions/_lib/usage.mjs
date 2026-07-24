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
  free: { imports: 20, video: 5, label: 'Free' },
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

/**
 * Claim one import slot. Returns { allowed, used, limit, plan, reason }.
 * Fails OPEN when metering is unavailable (no service key, RPC error): a
 * billing guard should never be the reason a paying user can't save a recipe.
 */
export async function reserveImport(admin, userId, kind) {
  if (!admin || !userId) return { allowed: true, metered: false }
  const plan = await planFor(admin, userId)
  const limits = limitsFor(plan)
  try {
    const { data, error } = await admin.rpc('reserve_import', {
      p_user_id: userId,
      p_kind: kind,
      p_limit: limits.imports,
      p_kind_limit: kindLimit(limits, kind),
    })
    if (error) return { allowed: true, metered: false }
    return { ...data, plan, metered: true }
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
    ? `You've saved all ${result?.limit ?? PLANS.free.imports} recipes in your free month. Upgrade to Pro for ${PLANS.pro.imports} a month.`
    : `You've hit this month's limit of ${result?.limit ?? PLANS.pro.imports} recipes. It resets at the start of next month.`
}
