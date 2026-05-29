// Is email confirmation required on signup? Signs up a throwaway user and checks
// whether a session comes back immediately (confirmation OFF) or not (ON).
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key)
const email = `worker-test+${Date.now()}@example.com`
const { data, error } = await supabase.auth.signUp({ email, password: 'Test-Passw0rd-' + Date.now() })
if (error) {
  console.log('signUp error:', error.message)
} else {
  const confirmationRequired = !data.session && !!data.user
  console.log(`signUp ok | immediate session: ${!!data.session} | EMAIL CONFIRMATION REQUIRED: ${confirmationRequired}`)
}
