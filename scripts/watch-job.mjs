// Poll a job until done/failed and report the resulting recipe.
// Run: node scripts/watch-job.mjs <jobId>
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
await s.auth.signInWithPassword({ email: process.env.APP_EMAIL, password: process.env.APP_PASSWORD })

const jobId = process.argv[2]
for (let i = 0; i < 50; i++) {
  const { data: job } = await s.from('recipe_jobs').select('status,error,recipe_id').eq('id', jobId).single()
  if (!job) { console.log('JOB GONE (dismissed?)'); break }
  if (job.status === 'done') {
    const { data: r } = await s.from('recipe_recipes').select('title,image_url,source_author,ingredients,steps,source_url').eq('id', job.recipe_id).single()
    console.log(`DONE ✓ "${r?.title}" | author=${r?.source_author} | image=${r?.image_url ? 'yes' : 'no'} | ${r?.ingredients?.length} ingredients, ${r?.steps?.length} steps`)
    console.log('source_url:', r?.source_url)
    break
  }
  if (job.status === 'failed') { console.log('FAILED ✗:', job.error); break }
  console.log(`[t+${i * 45}s] status=${job.status} — waiting…`)
  await new Promise((r) => setTimeout(r, 45000))
}
process.exit(0)
