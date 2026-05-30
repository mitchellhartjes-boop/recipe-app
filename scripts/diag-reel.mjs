// Diagnose how a reel is classified by the caption extractor (found / where the recipe is).
// Run: node scripts/diag-reel.mjs <reel-url> [<reel-url> ...]
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractReel } from '../netlify/functions/_lib/extract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })
const apiKey = process.env.ANTHROPIC_API_KEY

for (const url of process.argv.slice(2)) {
  console.log('\n' + '='.repeat(70) + '\n' + url)
  try {
    const res = await extractReel(url, { apiKey })
    const r = res.recipe
    console.log({
      found: r.found,
      where_is_recipe: r.where_is_recipe,
      title: r.title,
      external_url: r.external_url,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.length : 0,
      notes: r.notes_for_user,
      inaccessible: res.inaccessible || false,
    })
  } catch (e) {
    console.log('THREW:', e.message)
  }
}
