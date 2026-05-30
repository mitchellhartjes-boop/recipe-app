// Validate the Apify Instagram Scraper can read a reel (esp. an audience-restricted one).
// Run: node scripts/test-apify.mjs <reel-url> [<reel-url> ...]
// Needs APIFY_TOKEN in .env (Apify Console -> Settings -> API & Integrations -> Personal API token).
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })

const TOKEN = process.env.APIFY_TOKEN
if (!TOKEN) { console.error('Missing APIFY_TOKEN in .env'); process.exit(1) }

const ACTOR = 'apify~instagram-scraper'
const urls = process.argv.slice(2)
if (!urls.length) { console.error('Usage: node scripts/test-apify.mjs <reel-url> ...'); process.exit(1) }

for (const url of urls) {
  console.log('\n' + '='.repeat(72) + '\n' + url)
  const input = { directUrls: [url], resultsType: 'details', resultsLimit: 1, addParentData: false }
  const endpoint = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}`
  const t0 = Date.now()
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    const body = await res.json().catch(() => null)
    console.log(`HTTP ${res.status} in ${secs}s | items: ${Array.isArray(body) ? body.length : '(not an array)'}`)
    if (!Array.isArray(body)) { console.log('raw:', JSON.stringify(body).slice(0, 400)); continue }
    const it = body[0] || {}
    if (it.error) console.log('error:', it.error, '-', it.errorDescription)
    console.log({
      type: it.type,
      ownerUsername: it.ownerUsername,
      hasCaption: !!it.caption,
      captionPreview: (it.caption || '').replace(/\s+/g, ' ').slice(0, 180),
      displayUrl: it.displayUrl ? it.displayUrl.slice(0, 70) + '…' : null,
      videoUrl: it.videoUrl ? 'yes' : 'no',
    })
  } catch (e) {
    console.log('THREW:', e.message)
  }
}
