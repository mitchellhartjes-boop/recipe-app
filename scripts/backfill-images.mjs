// One-off: give existing recipes a permanent cover image where they don't have one.
// For each recipe with image_url IS NULL and a source_url, re-fetch a cover (Instagram embed
// cover for reels, og:image for websites), re-host it to Supabase Storage, and save the URL.
// Safe + idempotent: only fills blanks, never overwrites an existing image. Re-runnable.
//
// Run: node scripts/backfill-images.mjs        (add --dry to preview without writing)
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { fetchCaption, fetchPageOgImage } from '../netlify/functions/_lib/extract.mjs'
import { rehostImage } from '../netlify/functions/_lib/images.mjs'
import { getThumbnailUrl } from '../worker/lib/video.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })

// Optional yt-dlp (local only) — fallback cover for video reels whose embed has no static image.
const ytdlpPath = process.env.YTDLP_PATH || path.join(root, 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const YTDLP = fs.existsSync(ytdlpPath) ? ytdlpPath : null

const DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
})
const { error: authErr } = await supabase.auth.signInWithPassword({ email: process.env.APP_EMAIL, password: process.env.APP_PASSWORD })
if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1) }

const { data: recipes, error } = await supabase
  .from('recipe_recipes')
  .select('id, title, source_url, source_platform, image_url')
  .is('image_url', null)
  .order('created_at', { ascending: true })
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const todo = (recipes ?? []).filter((r) => r.source_url)
console.log(`${recipes?.length ?? 0} recipe(s) without an image; ${todo.length} have a source_url to try.${DRY ? '  (dry run)' : ''}`)

let filled = 0
for (const r of todo) {
  try {
    // Route by the URL itself: link-in-bio recipes have source_platform 'instagram' but a BLOG
    // source_url, so the og:image path is the right one for them.
    const isIg = /instagram\.com\/(reels?|p|tv)\//i.test(r.source_url)
    let cover = isIg ? (await fetchCaption(r.source_url)).imageUrl : await fetchPageOgImage(r.source_url)
    if (!cover && isIg && YTDLP) cover = await getThumbnailUrl(YTDLP, r.source_url) // video reel: creator thumbnail
    if (!cover) { console.log(`  – ${r.title}: no cover found`); continue }
    if (DRY) { console.log(`  · ${r.title}: would use ${cover.slice(0, 70)}…`); continue }
    const stored = await rehostImage(supabase, cover, r.title)
    if (!stored) { console.log(`  – ${r.title}: re-host failed`); continue }
    const { error: upErr } = await supabase.from('recipe_recipes').update({ image_url: stored }).eq('id', r.id)
    if (upErr) { console.log(`  – ${r.title}: update failed (${upErr.message})`); continue }
    filled++
    console.log(`  ✓ ${r.title}`)
  } catch (e) {
    console.log(`  – ${r.title}: ${e.message}`)
  }
  await sleep(800) // be gentle on Instagram
}
console.log(`\nDone — ${DRY ? 'previewed' : 'filled'} ${filled}/${todo.length}.`)
process.exit(0)
