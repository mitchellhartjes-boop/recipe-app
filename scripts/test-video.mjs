// Validate the video-only recipe path: yt-dlp -> ffmpeg (frames + audio) -> Groq Whisper + Claude vision.
// Local prototype; this is the heavy/worker-side path (NOT serverless).
// Run: node scripts/test-video.mjs [reelUrl]
//   needs ANTHROPIC_API_KEY; GROQ_API_KEY enables spoken-audio transcription (else frames-only).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const execFileP = promisify(execFile)
const TOOLS = path.resolve('tools')
const YTDLP = path.join(TOOLS, 'yt-dlp.exe')
const FFMPEG = path.join(TOOLS, 'ffmpeg.exe')
const WORKDIR = path.join(TOOLS, 'work')
const MODEL = process.env.VISION_MODEL || 'claude-sonnet-4-6'
const GROQ_MODEL = process.env.GROQ_MODEL || 'whisper-large-v3-turbo'
const MAX_FRAMES = 16
const url = process.argv[2] || 'https://www.instagram.com/reel/DU_3SMNEa39/'

const SYSTEM = `You extract a cooking recipe from a short cooking video. You are given: the post caption, a transcript of the spoken narration (if any), and frames sampled across the video (which may show on-screen text or the cooking process). Prioritize explicit info from the transcript and any on-screen text; use the frames to fill gaps and confirm steps. Combine everything into ONE coherent recipe.

Respond with ONLY a JSON object (no prose, no markdown fences):
{
  "found": boolean,
  "title": string|null,
  "description": string|null,
  "ingredients": [ { "raw": string, "quantity": string|null, "unit": string|null, "item": string|null } ],
  "steps": [ string ],
  "tags": [ string ],
  "confidence": "high"|"medium"|"low",
  "notes": string|null
}
found=true only if you can assemble a usable recipe. Do NOT invent specific quantities that aren't stated or clearly shown — leave them null and mention it in notes.`

async function transcribe(audioPath, groqKey) {
  const buf = await readFile(audioPath)
  const form = new FormData()
  form.append('model', GROQ_MODEL)
  form.append('response_format', 'text')
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3')
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })
  if (!r.ok) throw new Error(`Groq transcription failed (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`)
  return (await r.text()).trim()
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Missing ANTHROPIC_API_KEY')
    process.exit(1)
  }
  const groqKey = process.env.GROQ_API_KEY

  await rm(WORKDIR, { recursive: true, force: true })
  await mkdir(WORKDIR, { recursive: true })

  console.log(`Resolving ${url} ...`)
  const { stdout: desc } = await execFileP(YTDLP, ['--no-warnings', '--print', '%(description)s', url], { maxBuffer: 10 * 1024 * 1024 })
  console.log('Downloading video ...')
  await execFileP(YTDLP, ['--no-warnings', '-f', 'mp4/bestvideo+bestaudio/best', '-o', path.join(WORKDIR, 'video.%(ext)s'), url], { maxBuffer: 10 * 1024 * 1024 })
  const dl = (await readdir(WORKDIR)).find((f) => f.startsWith('video.'))
  if (!dl) throw new Error('video did not download')
  const videoPath = path.join(WORKDIR, dl)

  // Spoken audio -> transcript (Groq Whisper).
  let transcript = ''
  if (groqKey) {
    console.log('Extracting audio + transcribing (Groq) ...')
    const audioPath = path.join(WORKDIR, 'audio.mp3')
    await execFileP(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', audioPath], { maxBuffer: 10 * 1024 * 1024 })
    transcript = await transcribe(audioPath, groqKey)
    console.log(`Transcript (${transcript.length} chars): ${transcript.slice(0, 220)}${transcript.length > 220 ? '…' : ''}`)
  } else {
    console.log('(No GROQ_API_KEY — skipping audio, frames only)')
  }

  // Frames.
  console.log('Extracting frames ...')
  await execFileP(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vf', 'fps=1/6,scale=768:-1', path.join(WORKDIR, 'frame_%03d.jpg')], { maxBuffer: 10 * 1024 * 1024 })
  const frames = (await readdir(WORKDIR)).filter((f) => f.startsWith('frame_')).sort().slice(0, MAX_FRAMES)
  console.log(`Got ${frames.length} frames.`)

  const images = []
  for (const f of frames) {
    const data = await readFile(path.join(WORKDIR, f))
    images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') } })
  }

  const parts = [`Post caption:\n${(desc || '').trim().slice(0, 600)}`]
  if (transcript) parts.push(`\nSpoken transcript:\n${transcript.slice(0, 4000)}`)
  parts.push(`\nBelow are ${images.length} frames sampled in order across the video:`)

  const client = new Anthropic({ apiKey })
  console.log(`Sending ${transcript ? 'transcript + ' : ''}${images.length} frames to ${MODEL} ...`)
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: parts.join('\n') }, ...images, { type: 'text', text: 'Extract the recipe as specified.' }],
      },
    ],
  })
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  console.log('\n===== EXTRACTED =====')
  console.log(raw)
  console.log('\nusage:', JSON.stringify(msg.usage))
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
