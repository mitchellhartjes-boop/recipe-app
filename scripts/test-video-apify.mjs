// Validate the always-on video path: Apify (direct video URL) -> ffmpeg -> Groq + Claude.
// Run: node scripts/test-video-apify.mjs [<reel-url>]   (default: the steak audio-recipe reel)
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractVideoViaApify } from '../worker/lib/video.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })

const url = process.argv[2] || 'https://www.instagram.com/reel/DU_3SMNEa39/'
const ffmpeg = path.join(root, 'tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

console.log(`Extracting (via Apify): ${url}`)
const t0 = Date.now()
const out = await extractVideoViaApify({
  url,
  apifyToken: process.env.APIFY_TOKEN,
  apiKey: process.env.ANTHROPIC_API_KEY,
  groqKey: process.env.GROQ_API_KEY,
  ffmpeg,
  workdir: path.join(root, 'tools', 'work', 'test-apify'),
})
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s | frames: ${out.frameCount} | author: ${out.author} | image: ${out.imageUrl ? 'yes' : 'no'}`)
console.log(`transcript (first 200): ${(out.transcript || '').slice(0, 200)}`)
console.log('\nRECIPE:')
console.log(JSON.stringify(out.recipe, null, 2))
