// Exercise the submit (share-to-app) handler directly, end-to-end against Supabase.
// Saves real rows, prints results, then DELETES whatever it inserted (non-destructive).
// Run: node scripts/test-submit.mjs
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// override: the dev shell may export an empty ANTHROPIC_API_KEY that would otherwise shadow .env.
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })

const TOKEN = 'test-token-local'
process.env.SHORTCUT_TOKEN = TOKEN // the handler reads this at call time

const handler = (await import('../netlify/functions/submit.mjs')).default

const ENDPOINT = 'http://localhost/.netlify/functions/submit'
function call({ url, token = TOKEN, body, headers }) {
  const h = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }
  return handler(new Request(ENDPOINT, { method: 'POST', headers: h, body: body ?? JSON.stringify({ url }) }))
}

async function show(label, res) {
  const body = await res.json()
  console.log(`\n=== ${label}  (HTTP ${res.status}) ===`)
  console.log(JSON.stringify(body, null, 2))
  return body
}

const insertedRecipes = []
const insertedJobs = []
const insertedImages = []
const track = (body) => {
  if (body.recipe_id) insertedRecipes.push(body.recipe_id)
  if (body.job_id) insertedJobs.push(body.job_id)
  if (body.image_url) insertedImages.push(body.image_url)
}

// 1) auth: no token -> 401
await show('no token (expect 401)', await call({ url: 'https://example.com', token: null }))
// 2) auth: wrong token -> 401
await show('wrong token (expect 401)', await call({ url: 'https://example.com', token: 'nope' }))
// 3) no URL -> 400
await show('no url (expect 400)', await call({ body: JSON.stringify({}) }))
// 4) website (fast path -> saved). Also proves "URL buried in text" parsing + image re-hosting.
track(await show('website (expect saved + image_url)', await call({ body: JSON.stringify({ url: 'Found this: https://www.erinliveswhole.com/chicken-enchilada-skillet/ yum' }) })))
// 5) Instagram caption (fast path -> saved). Proves reel-cover capture + re-hosting.
track(await show('caption reel (expect saved + image_url)', await call({ url: 'https://www.instagram.com/reel/DW0Yd7ODXKx/' })))

// Verify the re-hosted images actually load.
for (const u of insertedImages) {
  const head = await fetch(u, { method: 'HEAD' })
  console.log(`image ${head.ok ? 'OK' : 'FAIL ' + head.status}: ${u}`)
}

// --- cleanup: delete the rows + storage objects this test created ---
if (insertedRecipes.length || insertedJobs.length || insertedImages.length) {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  )
  await supabase.auth.signInWithPassword({ email: process.env.APP_EMAIL, password: process.env.APP_PASSWORD })
  if (insertedRecipes.length) await supabase.from('recipe_recipes').delete().in('id', insertedRecipes)
  if (insertedJobs.length) await supabase.from('recipe_jobs').delete().in('id', insertedJobs)
  const keys = insertedImages.map((u) => u.split('/recipe-images/')[1]).filter(Boolean)
  if (keys.length) await supabase.storage.from('recipe-images').remove(keys)
  console.log(`\nCleaned up ${insertedRecipes.length} recipe(s), ${insertedJobs.length} job(s), ${keys.length} image(s).`)
}
