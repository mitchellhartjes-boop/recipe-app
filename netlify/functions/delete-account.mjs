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
//
// recipe_usage and recipe_profiles were missing until 2026-09-28, so deletions
// before then may have left usage counts and plan rows behind. recipe_shares
// is listed ahead of its migration: a missing table is skipped, not an error.
const USER_TABLES = [
  'device_tokens',
  'share_keys',
  'recipe_shares',
  'recipe_jobs',
  'recipe_grocery_items',
  'recipe_meal_plan',
  'recipe_category_prefs',
  'recipe_usage',
  'recipe_profiles',
  'recipe_recipes',
]

// Tables owned by OTHER apps sharing this database. Sounder is moving into
// Dilla's project so the account can run on Supabase Free, and its tables
// cascade-delete from auth.users. If Dilla removed the login of someone who
// also uses Sounder, their catches would vanish with it. So Dilla deletes its
// OWN data always, and the shared login only when no other app still needs it
// - the same rule Sounder's delete_account() already follows from its side.
const OTHER_APP_TABLES = ['fishing_spots', 'fishing_catches', 'fishing_photos', 'fishing_spot_photos']

// PostgREST's code for "no such table". Before Sounder moves in, its tables
// don't exist here, and that must read as "no other app" - not as a failure.
const TABLE_MISSING = 'PGRST205'
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
      if (error?.code === TABLE_MISSING) continue
      if (error) throw new Error(`Failed clearing ${table}: ${error.message}`)
    }

    // 3. Does another app in this database still use this login?
    //    Fail SAFE: if we can't tell, keep the login. A kept login is a
    //    recoverable nuisance; another app's data destroyed by cascade is not.
    let sharedWithAnotherApp = false
    for (const table of OTHER_APP_TABLES) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (error?.code === TABLE_MISSING) continue
      if (error) {
        console.error(`[delete-account] could not check ${table}; keeping the login:`, error.message)
        sharedWithAnotherApp = true
        break
      }
      if ((count ?? 0) > 0) {
        sharedWithAnotherApp = true
        break
      }
    }

    // 4. The auth user itself, LAST: if anything above failed we still have a
    //    valid account to retry against rather than a half-deleted ghost.
    //    Every Dilla row is already gone either way - for someone who also uses
    //    another app, deleting their Dilla account means deleting their Dilla
    //    data, and the login stays for the app they're still using.
    if (!sharedWithAnotherApp) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) throw new Error(`Failed removing the account: ${delErr.message}`)
    }

    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, message: e?.message || 'Could not delete the account — please try again.' }, 500)
  }
}
