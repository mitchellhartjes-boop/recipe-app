// Local async worker: drains the Supabase recipe_jobs queue, handling the slow
// extraction paths (link-in-bio via Claude web_search, video via yt-dlp/ffmpeg/Groq).
// Runs on your machine using the binaries in tools/. Same code can later run on a cloud box.
//
// Run: node worker/index.mjs
// Config (from .env / .env.local): VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
//   APP_EMAIL, APP_PASSWORD (your app login), ANTHROPIC_API_KEY, GROQ_API_KEY.
import dotenv from 'dotenv'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { recoverFromWeb } from '../netlify/functions/_lib/extract.mjs'
import { extractVideo } from './lib/video.mjs'

dotenv.config({ path: ['.env', '.env.local'], quiet: true })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
const EMAIL = process.env.APP_EMAIL
const PASSWORD = process.env.APP_PASSWORD
const ANTHROPIC = process.env.ANTHROPIC_API_KEY
const GROQ = process.env.GROQ_API_KEY

const TOOLS = path.resolve('tools')
const win = process.platform === 'win32'
const YTDLP = process.env.YTDLP_PATH || path.join(TOOLS, win ? 'yt-dlp.exe' : 'yt-dlp')
const FFMPEG = process.env.FFMPEG_PATH || path.join(TOOLS, win ? 'ffmpeg.exe' : 'ffmpeg')
const POLL_MS = 5000
const RUN_ONCE = process.env.WORKER_RUN_ONCE === '1' // drain the queue, then exit (testing / cron)
// Restrict which job kinds this worker handles (empty = all). Cloud handles
// link_in_bio (always-on); video must run on a residential IP (local), since
// Instagram blocks video downloads from datacenter IPs.
const KINDS = (process.env.WORKER_KINDS || '').split(',').map((s) => s.trim()).filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function toRecord(r, { url, sourcePlatform, sourceKind }) {
  return {
    title: r.title || 'Untitled recipe',
    description: r.description ?? null,
    source_platform: sourcePlatform,
    source_url: r.source_url ?? url,
    source_author: r.source_author ?? null,
    image_url: r.image_url ?? null,
    servings: r.servings ?? null,
    prep_minutes: r.prep_minutes ?? null,
    cook_minutes: r.cook_minutes ?? null,
    total_minutes: r.total_minutes ?? null,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes ?? null,
    status: 'saved',
    extraction_meta: { source_kind: sourceKind, confidence: r.confidence ?? null, recovered_notes: r.notes ?? r.notes_for_user ?? null },
  }
}

async function processJob(supabase, job) {
  console.log(`[job ${job.id}] start kind=${job.kind}`)
  await supabase.from('recipe_jobs').update({ status: 'processing' }).eq('id', job.id)

  let recipe
  if (job.kind === 'video') {
    if (!GROQ) console.warn('  (no GROQ_API_KEY — video will use frames only, lower confidence)')
    const { recipe: r } = await extractVideo({
      url: job.url,
      apiKey: ANTHROPIC,
      groqKey: GROQ,
      ytdlp: YTDLP,
      ffmpeg: FFMPEG,
      workdir: path.join(TOOLS, 'work', job.id),
    })
    if (!r.found) throw new Error(r.notes || 'No recipe found in the video')
    recipe = toRecord(r, { url: job.url, sourcePlatform: 'instagram', sourceKind: 'video' })
  } else if (job.kind === 'link_in_bio') {
    const { recipe: r } = await recoverFromWeb({
      title: job.meta?.title,
      author: job.meta?.author,
      sourceUrl: job.url,
      externalUrl: job.meta?.externalUrl ?? null,
      apiKey: ANTHROPIC,
    })
    if (!r.found) throw new Error(r.notes || 'Could not recover the recipe from the web')
    recipe = toRecord(r, { url: job.url, sourcePlatform: 'instagram', sourceKind: 'link-in-bio' })
  } else {
    throw new Error(`Unknown job kind: ${job.kind}`)
  }

  const { data, error } = await supabase.from('recipe_recipes').insert(recipe).select('id').single()
  if (error) throw error
  await supabase.from('recipe_jobs').update({ status: 'done', recipe_id: data.id, error: null }).eq('id', job.id)
  console.log(`[job ${job.id}] done -> recipe ${data.id} ("${recipe.title}")`)
}

async function main() {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'APP_EMAIL', 'APP_PASSWORD', 'ANTHROPIC_API_KEY'].filter(
    (k) => !process.env[k] && !(k === 'VITE_SUPABASE_URL' && SUPABASE_URL) && !(k === 'VITE_SUPABASE_PUBLISHABLE_KEY' && SUPABASE_KEY),
  )
  if (!SUPABASE_URL || !SUPABASE_KEY || !EMAIL || !PASSWORD || !ANTHROPIC) {
    console.error('Missing config. Need: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, APP_EMAIL, APP_PASSWORD, ANTHROPIC_API_KEY (and GROQ_API_KEY for video).')
    console.error('Missing:', missing.join(', ') || '(check APP_EMAIL/APP_PASSWORD/ANTHROPIC_API_KEY)')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr) {
    console.error('Worker login failed:', authErr.message)
    process.exit(1)
  }
  console.log(`Recipe worker online — signed in as ${EMAIL}. Polling every ${POLL_MS / 1000}s…`)

  for (;;) {
    try {
      let query = supabase.from('recipe_jobs').select('*').eq('status', 'queued')
      if (KINDS.length) query = query.in('kind', KINDS)
      const { data: jobs, error } = await query.order('created_at', { ascending: true }).limit(1)
      if (error) throw error
      const job = jobs?.[0]
      if (!job) {
        if (RUN_ONCE) {
          console.log('Queue empty — exiting (run-once mode).')
          break
        }
        await sleep(POLL_MS)
        continue
      }
      try {
        await processJob(supabase, job)
      } catch (e) {
        console.error(`[job ${job.id}] FAILED:`, e.message)
        await supabase.from('recipe_jobs').update({ status: 'failed', error: String(e.message).slice(0, 500) }).eq('id', job.id)
      }
    } catch (e) {
      console.error('poll error:', e.message)
      await sleep(POLL_MS)
    }
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
