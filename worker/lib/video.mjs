// Video-only recipe extraction: yt-dlp -> ffmpeg (audio + frames) -> Groq Whisper + Claude vision.
// Reusable module for the worker (and the earlier test harness). Worker-side only (needs binaries).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { fetchReelViaApify, fetchTikTokViaApify } from '../../netlify/functions/_lib/apify.mjs'
import { isTikTokUrl, vttToText } from '../../netlify/functions/_lib/tiktok.mjs'

const execFileP = promisify(execFile)

const SYSTEM = `You extract a cooking recipe from a short cooking video. You are given: the post caption, a transcript of the spoken narration (if any), and frames sampled across the video (which may show on-screen text or the cooking process). When the caption contains a written ingredient list or method, treat it as the PRIMARY source and copy its quantities exactly — creators write "2 cups flour" in the caption but say "add some flour" out loud, so the caption is where exact amounts live. Use the transcript and on-screen text for steps, technique and anything the caption omits, and the frames to fill gaps and confirm steps. Combine everything into ONE coherent recipe.

Respond with ONLY a JSON object (no prose, no markdown fences):
{
  "found": boolean,
  "title": string|null,
  "description": string|null,
  "source_author": string|null,
  "servings": string|null,
  "prep_minutes": number|null,
  "cook_minutes": number|null,
  "total_minutes": number|null,
  "ingredients": [ { "raw": string, "quantity": string|null, "unit": string|null, "item": string|null } ],
  "steps": [ string ],
  "tags": [ string ],
  "confidence": "high"|"medium"|"low",
  "notes": string|null
}
found=true only if you can assemble a usable recipe. Do NOT invent specific quantities that aren't stated or clearly shown — leave them null and mention it in notes.`

// The creator-chosen reel cover (a real frame). More reliable than the IG embed for video reels,
// whose embed often serves no static cover image. URL expires -> re-host it. Never throws.
export async function getThumbnailUrl(ytdlp, url) {
  try {
    const { stdout } = await execFileP(ytdlp, ['--no-warnings', '--skip-download', '--print', '%(thumbnail)s', url], {
      maxBuffer: 4 * 1024 * 1024,
    })
    const u = (stdout || '').trim().split('\n')[0].trim()
    return /^https?:\/\//i.test(u) ? u : null
  } catch {
    return null
  }
}

async function transcribe(audioPath, groqKey, model) {
  const buf = await readFile(audioPath)
  const form = new FormData()
  form.append('model', model)
  form.append('response_format', 'text')
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3')
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })
  if (!r.ok) throw new Error(`Groq transcription failed (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`)
  return (await r.text()).trim()
}

// Download a direct media URL to a file (used for Apify's video URL — a plain CDN link).
async function downloadToFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
  if (!res.ok) throw new Error(`video download failed (HTTP ${res.status})`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}

// Shared core: a downloaded video file + its caption -> ffmpeg (audio + frames) -> Groq + Claude.
// A pre-supplied `transcript` (e.g. TikTok's own subtitles) skips the audio
// extraction and the paid transcription call entirely.
async function processVideoFile({ videoPath, caption, apiKey, groqKey, ffmpeg, workdir, model, groqModel, maxFrames, transcript = '' }) {
  if (!transcript && groqKey) {
    const audioPath = path.join(workdir, 'audio.mp3')
    await execFileP(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', audioPath], {
      maxBuffer: 10 * 1024 * 1024,
    })
    transcript = await transcribe(audioPath, groqKey, groqModel)
  }

  await execFileP(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vf', 'fps=1/6,scale=768:-1', path.join(workdir, 'frame_%03d.jpg')], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const frames = (await readdir(workdir)).filter((f) => f.startsWith('frame_')).sort().slice(0, maxFrames)
  const images = []
  for (const f of frames) {
    const data = await readFile(path.join(workdir, f))
    images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') } })
  }

  // The caption is the most VALUABLE input here: it is where the creator writes
  // exact quantities, and neither the transcript ("a good glug") nor the frames
  // carry those reliably. It was capped at 600 chars while the transcript got
  // 4000 - so on a real recipe caption the model saw the intro and maybe one
  // ingredient, then nothing. It said so honestly ("cut off in the caption"),
  // which read as a bad extraction but was us truncating the evidence.
  //
  // 3000 clears Instagram's own 2200-character caption limit outright. The extra
  // tokens cost a fraction of a cent against a video import that costs ~8-12c.
  const parts = [`Post caption:\n${(caption || '').trim().slice(0, 3000)}`]
  if (transcript) parts.push(`\nSpoken transcript:\n${transcript.slice(0, 4000)}`)
  parts.push(`\nBelow are ${images.length} frames sampled in order across the video:`)

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      { role: 'user', content: [{ type: 'text', text: parts.join('\n') }, ...images, { type: 'text', text: 'Extract the recipe as specified.' }] },
    ],
  })
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  let recipe
  try {
    recipe = JSON.parse(cleaned)
  } catch {
    const i = cleaned.indexOf('{')
    const j = cleaned.lastIndexOf('}')
    if (i >= 0 && j > i) recipe = JSON.parse(cleaned.slice(i, j + 1))
    else throw new Error(`Video extraction returned no JSON: ${raw.slice(0, 200)}`)
  }
  return { recipe, transcript, frameCount: images.length, usage: msg.usage }
}

const DEFAULT_MODEL = process.env.VISION_MODEL || 'claude-sonnet-4-6'
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'whisper-large-v3-turbo'

// Always-on path (default): Apify reads the post (handles platform access) and returns a direct
// video URL + caption + cover image; we download the URL and run the shared pipeline. Works on the
// cloud worker — no PC, no yt-dlp, no datacenter-IP block. Throws a clear error for restricted
// posts. Routes by platform: Instagram reels and TikToks share everything past the fetch.
export async function extractVideoViaApify({ url, apifyToken, apiKey, groqKey, ffmpeg, workdir, model = DEFAULT_MODEL, groqModel = DEFAULT_GROQ_MODEL, maxFrames = 16 }) {
  await rm(workdir, { recursive: true, force: true })
  await mkdir(workdir, { recursive: true })

  let fetched
  let transcript = ''
  if (isTikTokUrl(url)) {
    fetched = await fetchTikTokViaApify(url, apifyToken)
    // TikTok ships its own WebVTT subtitles — a free transcript, so the paid
    // transcription pass is skipped. Frames + vision still run: TikTok recipes
    // put amounts in on-screen text at least as often as in speech.
    if (fetched.subtitleUrl) {
      try {
        const res = await fetch(fetched.subtitleUrl)
        if (res.ok) transcript = vttToText(await res.text())
      } catch {
        /* no subtitles — processVideoFile falls back to Groq on the audio */
      }
    }
  } else {
    fetched = await fetchReelViaApify(url, apifyToken)
  }

  const { caption, videoUrl, imageUrl, author } = fetched
  if (!videoUrl) throw new Error('Apify returned no video for this post (it may be a photo post or restricted).')
  const videoPath = path.join(workdir, 'video.mp4')
  await downloadToFile(videoUrl, videoPath)
  const out = await processVideoFile({ videoPath, caption, apiKey, groqKey, ffmpeg, workdir, model, groqModel, maxFrames, transcript })
  return { ...out, imageUrl, author }
}

// Local fallback path: yt-dlp downloads the reel (needs a residential IP + the binary), then the
// shared pipeline. The worker uses the Apify path by default; this stays for local/offline use.
export async function extractVideo({ url, apiKey, groqKey, ytdlp, ffmpeg, workdir, model = DEFAULT_MODEL, groqModel = DEFAULT_GROQ_MODEL, maxFrames = 16 }) {
  await rm(workdir, { recursive: true, force: true })
  await mkdir(workdir, { recursive: true })
  const { stdout: desc } = await execFileP(ytdlp, ['--no-warnings', '--print', '%(description)s', url], { maxBuffer: 10 * 1024 * 1024 })
  await execFileP(ytdlp, ['--no-warnings', '-f', 'mp4/bestvideo+bestaudio/best', '-o', path.join(workdir, 'video.%(ext)s'), url], { maxBuffer: 10 * 1024 * 1024 })
  const dl = (await readdir(workdir)).find((f) => f.startsWith('video.'))
  if (!dl) throw new Error('video did not download')
  return processVideoFile({ videoPath: path.join(workdir, dl), caption: desc, apiKey, groqKey, ffmpeg, workdir, model, groqModel, maxFrames })
}
