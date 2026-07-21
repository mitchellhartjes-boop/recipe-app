import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill it in.',
  )
}

export const supabase = createClient(url, key)

// Exposed for keepalive writes on page unload (see useMealPlan): a normal
// supabase query can't reliably complete while the app is being backgrounded,
// so we hand-build a `fetch(..., { keepalive: true })` to the REST endpoint.
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = key
