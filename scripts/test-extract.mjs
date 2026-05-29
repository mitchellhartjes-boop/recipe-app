// Validate the Instagram caption -> recipe pipeline on real reels.
// Run: node --env-file=.env scripts/test-extract.mjs
import { extractReel } from '../netlify/functions/_lib/extract.mjs'

const REELS = [
  ['Caption', 'https://www.instagram.com/reel/DW0Yd7ODXKx/'],
  ['Just Video', 'https://www.instagram.com/reel/DU_3SMNEa39/'],
  ['Link in Bio', 'https://www.instagram.com/reel/CvGPze_gLk_/'],
]

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY — run with: node --env-file=.env scripts/test-extract.mjs')
  process.exit(1)
}

let inTok = 0
let outTok = 0
for (const [label, url] of REELS) {
  console.log(`\n${'='.repeat(70)}\n${label} — ${url}`)
  try {
    const result = await extractReel(url, { apiKey })
    if (result.usage) {
      inTok += result.usage.input_tokens
      outTok += result.usage.output_tokens
    }
    console.log(`caption chars: ${result.captionChars} | model: ${result.model ?? '—'}`)
    console.log(JSON.stringify(result.recipe, null, 2))
  } catch (e) {
    console.error('ERROR:', e.message)
  }
}
console.log(`\n${'='.repeat(70)}\nTotal tokens — in: ${inTok}, out: ${outTok}`)
