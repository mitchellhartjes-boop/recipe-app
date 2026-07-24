// Permanent account deletion. Apple requires any app offering account creation
// to offer in-app deletion (App Store Review 5.1.1(v)) — this is that endpoint.
//
// POST /.netlify/functions/delete-account
//   auth: Authorization: Bearer <the user's Supabase access token>
//   ->    { ok: true } once the account and ALL its data are gone.
//
// The caller is identified ONLY by their verified JWT — never by a user_id in
// the body — so one user can never delete another. Deletion runs under the
// service role because removing an auth.users row and purging across tables is
// beyond what RLS grants a normal session.
import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

// Every table that holds per-user rows. Purged explicitly rather than trusting
// FK cascades, which aren't declared uniformly across these tables — an account
// deletion that silently leaves data behind is exactly what must not happen.
const USER_TABLES = [
  'device_tokens',
  'share_keys',
  'recipe_jobs',
  'recipe_grocery_items',
  'recipe_meal_plan',
  'recipe_category_prefs',
  'recipe_recipes',
]
const IMAGE_BUCKET = process.env.RECIPE_IMAGE_BUCKET || 'recipe-images'

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405)

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return json({ ok: false, message: 'Server is missing Supabase configuration.' }, 500)
  }

  // --- identify the caller from their token, and ONLY their token ---
  const auth = req.headers.get('authorization') || ''
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return json({ ok: false, message: 'Not signed in.' }, 401)

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return json({ ok: false, message: 'Your session has expired — sign in again.' }, 401)
  const userId = userData.user.id

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    // 1. Storage. Collect the keys of images THIS user's recipes reference and
    //    remove them. Only keys inside our bucket are touched — external cover
    //    URLs (e.g. a stock-photo CDN) have no object to delete.
    const { data: recipes } = await admin.from('recipe_recipes').select('image_url').eq('user_id', userId)
    const marker = `/${IMAGE_BUCKET}/`
    const keys = (recipes || [])
      .map((r) => r.image_url)
      .filter((u) => typeof u === 'string' && u.includes(marker))
      .map((u) => decodeURIComponent(u.split(marker)[1].split('?')[0]))
      .filter(Boolean)
    if (keys.length) {
      // Best-effort: a failed image cleanup must not block the account deletion.
      try {
        await admin.storage.from(IMAGE_BUCKET).remove(keys)
      } catch {
        /* orphaned images can be swept later; the account still goes */
      }
    }

    // 2. Every user-owned row, in an order that respects no FK (there are none
    //    between these) — a failure on any table aborts before we delete the
    //    auth user, so a retry can finish the job rather than orphaning it.
    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', userId)
      if (error) throw new Error(`Failed clearing ${table}: ${error.message}`)
    }

    // 3. The auth user itself. Done LAST: if anything above failed we still have
    //    a valid account to retry against, rather than a half-deleted ghost.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) throw new Error(`Failed removing the account: ${delErr.message}`)

    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Could not delete the account — please try again.' }, 500)
  }
}
