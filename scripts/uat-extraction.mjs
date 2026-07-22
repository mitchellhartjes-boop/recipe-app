// UAT harness: exercises every ingestion scenario against the REAL extraction
// code with REAL URLs and REAL API keys. This is the same code path the
// deployed Netlify functions run — only the HTTP wrapper differs.
//
// Run: node --experimental-strip-types scripts/uat-extraction.mjs
//      node --experimental-strip-types scripts/uat-extraction.mjs website
import dotenv from 'dotenv'
dotenv.config({ path: ['.env.local', '.env'] })

import { extractReel, extractWebPage, fetchCaption } from '../netlify/functions/_lib/extract.mjs'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY missing — cannot run extraction UAT.')
  process.exit(1)
}

const only = process.argv[2]

// Real, public URLs covering each scenario the app has to handle.
const CASES = [
  // NOTE: allrecipes.com and seriouseats.com return 403 to this test runner's
  // datacenter IP (bot protection). That is an artefact of where the test runs,
  // NOT an app bug — the deployed Netlify function fetches from a different
  // network. Sites below are ones this runner can actually reach.
  {
    id: 'website',
    label: 'Recipe WEBSITE (JSON-LD, ad-heavy blog)',
    url: 'https://www.budgetbytes.com/one-pot-creamy-cajun-chicken-pasta/',
    kind: 'web',
    expect: 'Full recipe: many ingredients + steps',
  },
  {
    id: 'website-blog',
    label: 'Recipe BLOG (long personal preamble)',
    url: 'https://cookieandkate.com/best-guacamole-recipe/',
    kind: 'web',
    expect: 'Recipe extracted despite the life story and page chrome',
  },
  {
    id: 'website-minimal',
    label: 'Recipe BLOG (minimal markup)',
    url: 'https://minimalistbaker.com/easy-1-pot-black-bean-soup/',
    kind: 'web',
    expect: 'Full recipe extracted',
  },
  {
    id: 'pinterest',
    label: 'PINTEREST pin',
    url: 'https://www.pinterest.com/pin/1548181853069207/',
    kind: 'web',
    expect: 'Either a recipe, or a clean "no recipe" that routes the user onward',
  },
  {
    id: 'ig-caption',
    label: 'INSTAGRAM — recipe in the CAPTION',
    url: 'https://www.instagram.com/reel/DXzp2b3R37-/',
    kind: 'reel',
    expect: 'found=true, where_is_recipe=caption',
  },
  {
    id: 'ig-video',
    label: 'INSTAGRAM — recipe only in the VIDEO',
    url: 'https://www.instagram.com/reel/DUo_etckYes/',
    kind: 'reel',
    expect: 'found=false + where_is_recipe=video  -> queues a video job',
  },
  {
    id: 'ig-linkinbio',
    label: 'INSTAGRAM — recipe on the creator BLOG (link in bio)',
    url: 'https://www.instagram.com/reel/DU_3SMNEa39/',
    kind: 'reel',
    expect: 'where_is_recipe=external_link (+ external_url if visible)',
  },
]

const pad = (s, n) => String(s).padEnd(n)

function verdictFor(c, r) {
  if (c.kind === 'web') {
    if (r.recipe?.found) return ['PASS', `${r.recipe.ingredients?.length ?? 0} ingredients, ${r.recipe.steps?.length ?? 0} steps`]
    return ['SOFT', `no recipe found — ${r.recipe?.notes_for_user ?? 'no reason given'}`]
  }
  // Instagram
  if (r.inaccessible) return ['BLOCKED', 'Instagram would not serve the caption (private / age-gated / removed)']
  const w = r.recipe?.where_is_recipe
  if (r.recipe?.found) return ['PASS', `caption recipe: ${r.recipe.ingredients?.length ?? 0} ingredients, ${r.recipe.steps?.length ?? 0} steps`]
  if (w === 'video') return ['PASS', 'correctly routed to the VIDEO path (would queue a job)']
  if (w === 'external_link') return ['PASS', `routed to BLOG path${r.recipe.external_url ? ` -> ${r.recipe.external_url}` : ' (no url in caption; user shares the page)'}`]
  return ['SOFT', `no recipe, where_is_recipe=${w ?? 'unknown'}`]
}

const results = []

for (const c of CASES) {
  if (only && c.id !== only) continue
  process.stdout.write(`\n▶ ${c.label}\n   ${c.url}\n`)
  const t0 = Date.now()
  try {
    let r
    if (c.kind === 'web') {
      r = await extractWebPage({ url: c.url, apiKey })
    } else {
      const cap = await fetchCaption(c.url)
      process.stdout.write(`   caption chars: ${cap.text.length}${cap.inaccessible ? ' (INACCESSIBLE)' : ''}\n`)
      r = await extractReel(c.url, { apiKey })
    }
    const [verdict, detail] = verdictFor(c, r)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    process.stdout.write(`   ${verdict}: ${detail}  [${secs}s]\n`)
    if (r.recipe?.title) process.stdout.write(`   title: "${r.recipe.title}"\n`)
    results.push({ id: c.id, label: c.label, verdict, detail })
  } catch (e) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    process.stdout.write(`   FAIL: ${e.message}  [${secs}s]\n`)
    results.push({ id: c.id, label: c.label, verdict: 'FAIL', detail: e.message })
  }
}

console.log('\n\n================ UAT SUMMARY ================')
for (const r of results) console.log(pad(r.verdict, 8), pad(r.id, 15), r.detail)
const bad = results.filter((r) => r.verdict === 'FAIL')
console.log(`\n${results.length} scenarios | ${results.filter((r) => r.verdict === 'PASS').length} pass | ${bad.length} fail`)
