// Ensure the user account exists and queue two test jobs (video + link-in-bio).
// Run with VITE_SUPABASE_*, APP_EMAIL, APP_PASSWORD in env.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const email = process.env.APP_EMAIL
const password = process.env.APP_PASSWORD
if (!url || !key || !email || !password) {
  console.error('Missing VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY/APP_EMAIL/APP_PASSWORD')
  process.exit(1)
}

const supabase = createClient(url, key)

// Sign up (instant now that confirmation is off) or sign in if already registered.
let { data, error } = await supabase.auth.signUp({ email, password })
if (error && /already|registered/i.test(error.message)) {
  ;({ data, error } = await supabase.auth.signInWithPassword({ email, password }))
}
if (error) {
  console.error('Auth failed:', error.message)
  process.exit(1)
}
console.log('Authed as', data.user?.email)

const jobs = [
  { url: 'https://www.instagram.com/reel/DU_3SMNEa39/', kind: 'video', meta: {} },
  {
    url: 'https://www.instagram.com/reel/CvGPze_gLk_/',
    kind: 'link_in_bio',
    meta: { title: 'Cheesy Chicken Enchilada Skillet', author: 'erinliveswhole' },
  },
]
const { data: ins, error: e2 } = await supabase.from('recipe_jobs').insert(jobs).select('id,kind,status')
if (e2) {
  console.error('Insert failed:', e2.message)
  process.exit(1)
}
console.log('Queued jobs:', JSON.stringify(ins, null, 2))
