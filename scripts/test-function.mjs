// Exercise the Netlify extract function handler directly (Node has global Request/Response).
// Run: node scripts/test-function.mjs   (needs ANTHROPIC_API_KEY)
import handler from '../netlify/functions/extract.mjs'

const cases = [
  ['caption reel', 'https://www.instagram.com/reel/DW0Yd7ODXKx/'],
  ['video-only reel', 'https://www.instagram.com/reel/DU_3SMNEa39/'],
  ['link-in-bio reel', 'https://www.instagram.com/reel/CvGPze_gLk_/'],
  ['recipe website', 'https://www.erinliveswhole.com/chicken-enchilada-skillet/'],
]

for (const [label, url] of cases) {
  const req = new Request('http://localhost/.netlify/functions/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  try {
    const res = await handler(req)
    const body = await res.json()
    console.log(`\n=== ${label}  (HTTP ${res.status}) ===`)
    if (body.ok) {
      console.log(
        `OK | kind=${body.source_kind} | "${body.recipe.title}" | ${body.recipe.ingredients.length} ingredients, ${body.recipe.steps.length} steps | image=${body.recipe.image_url ? 'yes' : 'no'}`,
      )
    } else if (body.reason) {
      console.log(`not-ok | reason=${body.reason} | ${body.message}`)
      if (body.recover) console.log(`  recover hint: ${JSON.stringify(body.recover)}`)
    } else {
      console.log('ERROR:', JSON.stringify(body))
    }
  } catch (e) {
    console.log(`\n=== ${label} ===\nTHREW: ${e.message}`)
  }
}
