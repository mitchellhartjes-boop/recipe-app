// Read one shared recipe by its token. PUBLIC on purpose — the recipient may
// have never heard of Dilla, and requiring an account to read a recipe someone
// sent them would defeat the entire feature.
//
// This is the ONLY path by which a recipe leaves its owner's row-level
// security, so the rules are narrow and enforced here rather than in RLS:
//   - the token must exist, not be revoked, and not be past expires_at
//   - exactly one recipe comes back, the one the token names
//   - nothing about the owner is returned beyond the creator attribution that
//     was already public on the original post
//
// GET /.netlify/functions/shared-recipe?token=...
import { adminClient } from './_lib/usage.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Belt and braces with the netlify.toml header: a shared recipe is
      // person-to-person and must never end up in an index.
      'X-Robots-Tag': 'noindex, nofollow',
      ...CORS,
    },
  })

// What a recipient is allowed to see. An explicit list, not `select *`:
// a column added later (a private note, an internal flag) must not silently
// start appearing on a public page.
const FIELDS = [
  'id',
  'title',
  'description',
  'servings',
  'prep_minutes',
  'cook_minutes',
  'total_minutes',
  'ingredients',
  'steps',
  'tags',
  'image_url',
  'source_platform',
  'source_url',
  'source_author',
].join(',')

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS })

  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (!token) return json({ error: 'Missing token.' }, 400)

  const admin = adminClient()
  if (!admin) return json({ error: 'Sharing is unavailable right now.' }, 500)

  const { data: share, error } = await admin
    .from('recipe_shares')
    .select('recipe_id, expires_at, revoked_at, view_count')
    .eq('token', token)
    .maybeSingle()

  // One message for "never existed", "revoked" and "expired". Distinguishing
  // them tells a stranger holding a guessed token whether they got close.
  const gone = { error: 'gone', message: 'This link has expired or been turned off. Ask for a new one.' }
  if (error || !share) return json(gone, 404)
  if (share.revoked_at) return json(gone, 404)
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return json(gone, 404)

  const { data: recipe, error: rErr } = await admin
    .from('recipe_recipes')
    .select(FIELDS)
    .eq('id', share.recipe_id)
    .maybeSingle()

  // The owner deleted it after sharing. Same answer: the link no longer leads
  // anywhere, and that is all the recipient needs to know.
  if (rErr || !recipe) return json(gone, 404)

  // Soft metric: how many people actually open a shared link is the number
  // that says whether sharing works as a growth loop. Best effort and never
  // awaited - a counter must not slow down or break the read.
  admin
    .from('recipe_shares')
    .update({ view_count: (share.view_count ?? 0) + 1 })
    .eq('token', token)
    .then(null, () => {})

  return json({ recipe })
}
