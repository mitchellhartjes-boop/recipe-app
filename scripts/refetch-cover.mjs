// Re-fetch + re-host the cover image for an existing recipe (fixes a wrong/missing cover).
// Replaces image_url and deletes the old storage object. Run: node scripts/refetch-cover.mjs <recipeId>
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { fetchCaption, fetchPageOgImage } from '../netlify/functions/_lib/extract.mjs'
import { rehostImage } from '../netlify/functions/_lib/images.mjs'
import { fetchReelViaApify } from '../netlify/functions/_lib/apify.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
await s.auth.signInWithPassword({ email: process.env.APP_EMAIL, password: process.env.APP_PASSWORD })

const id = process.argv[2]
if (!id) { console.error('Usage: node scripts/refetch-cover.mjs <recipeId>'); process.exit(1) }
const { data: r, error } = await s.from('recipe_recipes').select('id,title,source_url,image_url').eq('id', id).single()
if (error || !r) { console.error('recipe not found'); process.exit(1) }

const isIg = /instagram\.com\/(reels?|p|tv)\//i.test(r.source_url || '')
let cover = isIg ? (await fetchCaption(r.source_url)).imageUrl : await fetchPageOgImage(r.source_url)
// Some IG embed variants expose no cover — fall back to Apify's reliable displayUrl.
if (!cover && isIg && process.env.APIFY_TOKEN) {
  try { cover = (await fetchReelViaApify(r.source_url, process.env.APIFY_TOKEN)).imageUrl; if (cover) console.log('(used Apify fallback)') } catch (e) { console.log('apify fallback failed:', e.message) }
}
if (!cover) { console.log(`no cover found for "${r.title}" (source: ${r.source_url})`); process.exit(0) }

const stored = await rehostImage(s, cover, r.title)
if (!stored) { console.log('re-host failed'); process.exit(1) }
const oldKey = r.image_url?.split('/recipe-images/')[1]
await s.from('recipe_recipes').update({ image_url: stored }).eq('id', id)
if (oldKey) await s.storage.from('recipe-images').remove([oldKey])
console.log(`✓ "${r.title}" -> ${stored}${oldKey ? `  (removed old ${oldKey})` : ''}`)
process.exit(0)
