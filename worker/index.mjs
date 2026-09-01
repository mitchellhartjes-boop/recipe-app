// Local async worker: drains the Supabase recipe_jobs queue, handling the slow
// extraction paths (link-in-bio via Claude web_search, video via yt-dlp/ffmpeg/Groq).
// Runs on your machine using the binaries in tools/. Same code can later run on a cloud box.
//
// Run: node worker/index.mjs
// Config (from .env / .env.local): VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
//   APP_EMAIL, APP_PASSWORD (your app login), ANTHROPIC_API_KEY, GROQ_API_KEY.
import dotenv from 'dotenv'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { recoverFromWeb, fetchPageOgImage, extractRecipeFromText } from '../netlify/functions/_lib/extract.mjs'
import { rehostImage } from '../netlify/functions/_lib/images.mjs'
import { fetchReelViaApify, fetchPageViaApify } from '../netlify/functions/_lib/apify.mjs'
import { refundImport } from '../netlify/functions/_lib/usage.mjs'
import { friendlyError } from '../netlify/functions/_lib/friendlyError.mjs'
import { isTikTokUrl } from '../netlify/functions/_lib/tiktok.mjs'
import { extractVideoViaApify } from './lib/video.mjs'
import { sendPush, apnsConfigured } from './lib/apns.mjs'

dotenv.config({ path: ['.env', '.env.local'], quiet: true })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
const EMAIL = process.env.APP_EMAIL
const PASSWORD = process.env.APP_PASSWORD
const ANTHROPIC = process.env.ANTHROPIC_API_KEY
const GROQ = process.env.GROQ_API_KEY
const APIFY = process.env.APIFY_TOKEN
// Bypasses RLS so one worker can drain every user's queue. Each recipe is
// attributed from the job's own user_id — never assumed.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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

// Tell the user how an async job turned out. This is the whole point of push:
// by the time the worker finishes, minutes after the share, the app is suspended
// and a local notification can't fire. Cover jobs are silent — they just backfill
// an image on a recipe the user was already notified about.
async function notifyJob(supabase, job, outcome) {
  // Cover and steps-backfill jobs are silent: they complete a recipe the user
  // was already notified about, and a second ping (or a scary failure for a
  // recipe that exists and works) would only confuse.
  if (job.kind === 'cover' || job.meta?.backfill || !job.user_id || !apnsConfigured()) return
  const { data: tokens } = await supabase.from('device_tokens').select('token').eq('user_id', job.user_id)
  if (!tokens?.length) return

  const content = outcome.ok
    ? { title: 'Recipe saved', body: `“${outcome.title}” is in your library.`, data: { recipe_id: outcome.recipeId } }
    : { title: 'Dilla couldn’t save that', body: outcome.message || 'That reel couldn’t be imported — try a screenshot.' }

  for (const { token } of tokens) {
    try {
      const res = await sendPush(token, content)
      // Prune tokens APNs says are gone, so a dead device isn't retried forever.
      if (res.dead) {
        await supabase.from('device_tokens').delete().eq('token', token)
        console.log(`[job ${job.id}] pruned dead device token`)
      } else if (!res.ok) {
        console.warn(`[job ${job.id}] push failed: ${res.status} ${res.reason}`)
      }
    } catch (e) {
      console.warn(`[job ${job.id}] push error: ${e.message}`)
    }
  }
}

async function processJob(supabase, job) {
  console.log(`[job ${job.id}] start kind=${job.kind}`)
  await supabase.from('recipe_jobs').update({ status: 'processing' }).eq('id', job.id)

  // Cover-only job: an instant caption recipe whose embed had no cover. Pull a reliable cover from
  // Apify and attach it to the existing recipe (no new recipe). Never blocks — failure is harmless.
  if (job.kind === 'cover') {
    const recipeId = job.meta?.recipe_id
    let stored = null
    try {
      if (recipeId && APIFY) {
        const { data: cur } = await supabase.from('recipe_recipes').select('image_url').eq('id', recipeId).single()
        const { imageUrl } = await fetchReelViaApify(job.url, APIFY)
        stored = imageUrl ? await rehostImage(supabase, imageUrl, 'reel') : null
        if (stored) {
          await supabase.from('recipe_recipes').update({ image_url: stored }).eq('id', recipeId)
          // Drop the previous image (e.g. a play-button lookaside cover) we just replaced.
          const oldKey = cur?.image_url?.split('/recipe-images/')[1]
          if (oldKey && !stored.endsWith(oldKey)) await supabase.storage.from('recipe-images').remove([oldKey])
        }
      }
    } catch (e) {
      console.warn(`[job ${job.id}] cover fetch failed: ${e.message}`)
    }
    await supabase.from('recipe_jobs').update({ status: 'done', recipe_id: recipeId ?? null, error: null }).eq('id', job.id)
    console.log(`[job ${job.id}] cover ${stored ? 'attached' : 'skipped'} -> recipe ${recipeId}`)
    return
  }

  // Steps backfill: a caption import saved with ingredients but no method (the
  // caption was just a shopping list). Watch the video and complete the EXISTING
  // recipe rather than creating a new one. Unmetered at insert, so validate
  // hard before doing any paid work: the recipe must belong to the job's user
  // and genuinely have no steps — otherwise a crafted client insert could buy
  // free video runs.
  if (job.kind === 'video' && job.meta?.backfill === 'steps' && job.meta?.recipe_id) {
    const { data: target } = await supabase
      .from('recipe_recipes')
      .select('id, user_id, steps, image_url, servings, prep_minutes, cook_minutes, total_minutes')
      .eq('id', job.meta.recipe_id)
      .maybeSingle()
    const valid = target && target.user_id === job.user_id && (!Array.isArray(target.steps) || target.steps.length === 0)
    if (!valid) {
      await supabase.from('recipe_jobs').update({ status: 'done', error: 'backfill skipped: not eligible' }).eq('id', job.id)
      console.log(`[job ${job.id}] backfill skipped (recipe missing, not owned, or already has steps)`)
      return
    }
    if (!APIFY) throw new Error('APIFY_TOKEN is not set — needed to fetch the video')
    const { recipe: r, imageUrl } = await extractVideoViaApify({
      url: job.url,
      apifyToken: APIFY,
      apiKey: ANTHROPIC,
      groqKey: GROQ,
      ffmpeg: FFMPEG,
      workdir: path.join(TOOLS, 'work', job.id),
    })
    const patch = {}
    if (r.found && Array.isArray(r.steps) && r.steps.length) patch.steps = r.steps
    // The video often states what the caption omitted — fill blanks, never overwrite.
    if (target.servings == null && r.servings != null) patch.servings = r.servings
    if (target.prep_minutes == null && r.prep_minutes != null) patch.prep_minutes = r.prep_minutes
    if (target.cook_minutes == null && r.cook_minutes != null) patch.cook_minutes = r.cook_minutes
    if (target.total_minutes == null && r.total_minutes != null) patch.total_minutes = r.total_minutes
    if (!target.image_url && imageUrl) {
      try {
        const stored = await rehostImage(supabase, imageUrl, 'reel')
        if (stored) patch.image_url = stored
      } catch {
        /* cover is a bonus here; the steps are the job */
      }
    }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('recipe_recipes').update(patch).eq('id', target.id)
      if (error) throw error
    }
    await supabase.from('recipe_jobs').update({ status: 'done', recipe_id: target.id, error: null }).eq('id', job.id)
    console.log(`[job ${job.id}] backfill -> recipe ${target.id} (${patch.steps ? patch.steps.length + ' steps' : 'no steps found in video'})`)
    return
  }

  let recipe
  let coverHint = null
  if (job.kind === 'video') {
    if (!APIFY) throw new Error('APIFY_TOKEN is not set — needed to fetch the reel video')
    if (!GROQ) console.warn('  (no GROQ_API_KEY — video will use frames only, lower confidence)')
    // The transcript is deliberately NOT destructured here: it is never stored,
    // logged, or attached to the job. Only the extracted recipe text survives.
    const workdir = path.join(TOOLS, 'work', job.id)
    let extracted
    try {
      extracted = await extractVideoViaApify({
        url: job.url,
        apifyToken: APIFY,
        apiKey: ANTHROPIC,
        groqKey: GROQ,
        ffmpeg: FFMPEG,
        workdir,
      })
    } finally {
      // Delete the video, extracted audio, and sampled frames as soon as the
      // extraction returns — success or failure. The cloud runner is ephemeral
      // so nothing survived a run anyway, but "media is deleted after each job"
      // is a claim we make to App Review and to users: it should be true in the
      // CODE, not merely a side effect of the host being destroyed.
      await rm(workdir, { recursive: true, force: true }).catch(() => {})
    }
    const { recipe: r, imageUrl, author } = extracted
    if (!r.found) throw new Error(r.notes || 'No recipe found in the video')
    recipe = toRecord(r, { url: job.url, sourcePlatform: isTikTokUrl(job.url) ? 'tiktok' : 'instagram', sourceKind: 'video' })
    if (!recipe.source_author && author) recipe.source_author = author
    coverHint = imageUrl
  } else if (job.kind === 'web') {
    // A publisher that refuses our datacenter IP. Apify's actor runs inside
    // their platform, so it reaches the page through their proxy - the thing we
    // cannot do directly on this plan. See fetchPageViaApify for the numbers.
    //
    // RESIDENTIAL is tried only as a SECOND attempt: it costs meaningfully more
    // than the default pool, and plenty of these sites are only screening out
    // obvious datacenter ranges rather than running a real fingerprint check.
    let page
    try {
      page = await fetchPageViaApify(job.url, APIFY)
    } catch (first) {
      console.warn(`[job ${job.id}] default proxy pool failed (${first.message}); retrying residential`)
      page = await fetchPageViaApify(job.url, APIFY, { proxyGroup: 'RESIDENTIAL' })
    }
    const { recipe: r } = await extractRecipeFromText({
      text: page.text,
      sourceUrl: job.url,
      apiKey: ANTHROPIC,
    })
    if (!r.found) throw new Error(r.notes_for_user || 'No recipe found on that page')
    recipe = toRecord(r, { url: job.url, sourcePlatform: 'web', sourceKind: 'web' })
    coverHint = page.imageUrl
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

  // Best-effort permanent cover image (video: Apify's cover; link-in-bio: the blog's og:image).
  // Re-hosted to Supabase Storage so it never expires. Never blocks the recipe save.
  try {
    let cover = coverHint
    if (!cover && job.kind === 'link_in_bio') cover = await fetchPageOgImage(recipe.source_url)
    const stored = cover ? await rehostImage(supabase, cover, recipe.title) : null
    if (stored) recipe.image_url = stored
  } catch (e) {
    console.warn(`[job ${job.id}] image capture skipped: ${e.message}`)
  }

  // Attribute the recipe to whoever queued the job. Under the service role
  // auth.uid() is null, so the column default cannot do this — and getting it
  // wrong would file one user's recipe in another's library.
  const { data, error } = await supabase
    .from('recipe_recipes')
    .insert({ ...recipe, user_id: job.user_id })
    .select('id')
    .single()
  if (error) throw error
  await supabase.from('recipe_jobs').update({ status: 'done', recipe_id: data.id, error: null }).eq('id', job.id)
  console.log(`[job ${job.id}] done -> recipe ${data.id} ("${recipe.title}")`)
  await notifyJob(supabase, job, { ok: true, title: recipe.title, recipeId: data.id })
}

// How many queued jobs to consider when picking the next one. Bounded on
// purpose: within this window Pro goes first, but a free user's job can only
// ever be passed by Pro jobs ALREADY ahead of it in the window, so it keeps
// advancing rather than being starved indefinitely.
const PRIORITY_WINDOW = 10

// Pro imports jump the queue. One extra lookup, no schema change: the jobs are
// already oldest-first, so the first Pro job in the window is the oldest Pro
// job, and the fallback is simply the oldest job overall.
async function pickJob(supabase, jobs) {
  if (!jobs?.length) return null
  if (jobs.length === 1) return jobs[0]
  try {
    const ids = [...new Set(jobs.map((j) => j.user_id).filter(Boolean))]
    if (!ids.length) return jobs[0]
    const { data: profiles } = await supabase.from('recipe_profiles').select('user_id, plan').in('user_id', ids)
    const pro = new Set((profiles ?? []).filter((p) => p.plan === 'pro').map((p) => p.user_id))
    return jobs.find((j) => pro.has(j.user_id)) ?? jobs[0]
  } catch {
    return jobs[0] // a plan lookup hiccup must never stall the queue
  }
}

async function main() {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'APP_EMAIL', 'APP_PASSWORD', 'ANTHROPIC_API_KEY'].filter(
    (k) => !process.env[k] && !(k === 'VITE_SUPABASE_URL' && SUPABASE_URL) && !(k === 'VITE_SUPABASE_PUBLISHABLE_KEY' && SUPABASE_KEY),
  )
  if (!SUPABASE_URL || !ANTHROPIC || (!SERVICE_KEY && (!SUPABASE_KEY || !EMAIL || !PASSWORD))) {
    console.error('Missing config. Need: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, APP_EMAIL, APP_PASSWORD, ANTHROPIC_API_KEY (and GROQ_API_KEY for video).')
    console.error('Missing:', missing.join(', ') || '(check APP_EMAIL/APP_PASSWORD/ANTHROPIC_API_KEY)')
    process.exit(1)
  }

  // Prefer the service role: the worker drains jobs for EVERY user, and an
  // RLS-scoped session can only see its own rows — as a single signed-in account
  // it would silently never pick up anybody else's work. Falls back to the old
  // account sign-in when the service key isn't configured, so a local run
  // without it still works on the owner's own jobs.
  let supabase
  if (SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    console.log(`Recipe worker online — service role (all users). Polling every ${POLL_MS / 1000}s…`)
  } else {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (authErr) {
      console.error('Worker login failed:', authErr.message)
      process.exit(1)
    }
    console.warn(`Recipe worker online — signed in as ${EMAIL} (SINGLE ACCOUNT).`)
    console.warn('Set SUPABASE_SERVICE_ROLE_KEY to process every user\'s jobs.')
  }

  // Rescue orphans before polling. A runner killed mid-job (workflow timeout,
  // infra eviction) leaves its row stuck at 'processing' — and the poll only
  // ever selects 'queued', so nothing would retry it and the user who shared it
  // waits forever with no notification. Anything still 'processing' well past
  // the workflow's own timeout cannot be alive: put it back in the queue.
  // Safe under the `recipe-worker` concurrency group (never two drains at once).
  try {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: revived, error: reviveErr } = await supabase
      .from('recipe_jobs')
      .update({ status: 'queued' })
      .eq('status', 'processing')
      .lt('updated_at', staleBefore)
      .select('id')
    if (reviveErr) console.warn('stale-job requeue failed:', reviveErr.message)
    else if (revived?.length) console.warn(`Requeued ${revived.length} stale processing job(s).`)
  } catch (e) {
    console.warn('stale-job requeue error:', e.message)
  }

  let consecutivePollErrors = 0
  for (;;) {
    try {
      let query = supabase.from('recipe_jobs').select('*').eq('status', 'queued')
      if (KINDS.length) query = query.in('kind', KINDS)
      const { data: jobs, error } = await query.order('created_at', { ascending: true }).limit(PRIORITY_WINDOW)
      if (error) throw error
      consecutivePollErrors = 0
      const job = await pickJob(supabase, jobs)
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
        // Raw reason to the log, human reason to the row. recipe_jobs.error is
        // rendered verbatim on the failed-job card in the library, so it is a
        // USER-FACING column and must never carry a vendor's billing message.
        console.error(`[job ${job.id}] FAILED:`, e.message)
        await supabase
          .from('recipe_jobs')
          .update({ status: 'failed', error: friendlyError(e.message).slice(0, 500) })
          .eq('id', job.id)
        // Give the import slot back. The job failing means the user got NOTHING
        // for it, and an audience-restricted reel is the common case — charging
        // a video import for that burns 1 of only 3 a free user gets per month.
        //
        // Only when the job IS the import. A cover job or a steps backfill is a
        // follow-up to a recipe that already saved and was already paid for;
        // refunding those would hand out free imports on every cover hiccup.
        const jobWasTheImport = !job.meta?.recipe_id && !job.meta?.backfill
        if (jobWasTheImport && job.user_id) {
          const kind = job.meta?.charged_kind || (job.kind === 'video' ? 'video' : 'web')
          await refundImport(supabase, job.user_id, kind)
          console.log(`[job ${job.id}] refunded a '${kind}' import`)
        }
        // Tell the user it failed — they shared it and are waiting. Best-effort:
        // a push problem must not mask the original job failure.
        try {
          await notifyJob(supabase, job, { ok: false, message: friendlyError(e.message) })
        } catch (pushErr) {
          console.warn(`[job ${job.id}] failure-notify error: ${pushErr.message}`)
        }
      }
    } catch (e) {
      console.error('poll error:', e.message)
      // In run-once mode an erroring queue query must FAIL the run, not retry
      // until the workflow timeout: the silent spin blocks the concurrency
      // slot, queues every later dispatch behind it, and hides the real error
      // (bad URL/key) as a "hang". Three strikes and out, loudly.
      consecutivePollErrors += 1
      if (RUN_ONCE && consecutivePollErrors >= 3) {
        console.error('Three consecutive poll errors in run-once mode — failing the run. Check SUPABASE URL/key secrets.')
        process.exit(1)
      }
      await sleep(POLL_MS)
    }
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
