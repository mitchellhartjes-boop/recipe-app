// Validate link-in-bio recovery: dish + creator -> Claude web search/fetch -> full recipe.
// Run: node scripts/test-linkbio.mjs   (needs ANTHROPIC_API_KEY)
import { recoverFromWeb } from '../netlify/functions/_lib/extract.mjs'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

// Inputs as the caption pass returned for reel #3 (found:false, but had title + author):
const input = {
  title: 'Cheesy Chicken Enchilada Skillet',
  author: 'erinliveswhole',
  sourceUrl: 'https://www.instagram.com/reel/CvGPze_gLk_/',
}

console.log(`Recovering "${input.title}" by @${input.author} ...`)
const r = await recoverFromWeb({ ...input, apiKey })
console.log(`\nstop_reason: ${r.stop_reason} | model: ${r.model}`)
console.log(JSON.stringify(r.recipe, null, 2))
console.log('\nusage:', JSON.stringify(r.usage))
