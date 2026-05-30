// Enqueue a job for the worker. Run: node scripts/queue.mjs <reel-url> [video|link_in_bio]
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: [path.join(root, '.env'), path.join(root, '.env.local')], quiet: true, override: true })
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
await s.auth.signInWithPassword({ email: process.env.APP_EMAIL, password: process.env.APP_PASSWORD })

const [url, kind = 'video'] = process.argv.slice(2)
const { data, error } = await s.from('recipe_jobs').insert({ url, kind }).select('id').single()
console.log(error ? 'ERR ' + error.message : 'JOB ' + data.id)
process.exit(0)
