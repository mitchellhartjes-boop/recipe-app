// Re-host recipe cover images in Supabase Storage so they never rot.
// Instagram reel-cover CDN URLs carry an expiry signature (oe=...) and recipe-site og:images
// can move; downloading the bytes once and serving them from our own bucket makes them permanent.
// Shared by the serverless functions (extract, submit) and the worker.
import { createClient } from '@supabase/supabase-js'

const BUCKET = process.env.RECIPE_IMAGE_BUCKET || 'recipe-images'
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
const MAX_BYTES = 8 * 1024 * 1024

function slug(s) {
  return String(s || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'recipe'
}

// Download an image URL and upload it to the public bucket. Returns a permanent public URL,
// or null on ANY problem (caller decides the fallback). Never throws.
export async function rehostImage(supabase, srcUrl, keyHint = 'recipe') {
  if (!supabase || !srcUrl || typeof srcUrl !== 'string' || !/^https?:\/\//i.test(srcUrl)) return null
  try {
    const res = await fetch(srcUrl, { headers: { 'User-Agent': WEB_UA, Accept: 'image/avif,image/webp,image/*,*/*' } })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (ct && !ct.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 100 || buf.length > MAX_BYTES) return null
    const ext = EXT[ct] || 'jpg'
    const key = `${slug(keyHint)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(key, buf, {
      contentType: ct || 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) return null
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

// Find a representative stock photo for a recipe that has no cover of its own
// (cocktails, screenshots, manual adds). Uses the free Pexels API; returns a
// direct image URL or null. No-ops gracefully until PEXELS_API_KEY is set, so
// this can ship dormant and "wake up" the moment the key is added to the env.
// Never throws.
export async function findStockPhoto(query) {
  const key = process.env.PEXELS_API_KEY
  if (!key || !query || typeof query !== 'string') return null
  try {
    const url = `https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(query.trim())}`
    const res = await fetch(url, { headers: { Authorization: key } })
    if (!res.ok) return null
    const data = await res.json()
    const photo = data?.photos?.[0]
    if (!photo) return null
    // Prefer a sensibly-sized rendition; fall back through what's available.
    return photo.src?.large || photo.src?.landscape || photo.src?.original || photo.src?.medium || null
  } catch {
    return null
  }
}

// Resolve a permanent cover for a recipe: try the source image first (re-hosted
// so it never rots); if there isn't one, fall back to a Pexels stock photo from
// `photoQuery` (also re-hosted). Returns a permanent public URL or null (caller
// then shows the designed gradient+emoji card). Never throws.
export async function coverImage(supabase, { srcUrl, photoQuery, keyHint = 'recipe' }) {
  const direct = await rehostImage(supabase, srcUrl, keyHint)
  if (direct) return direct
  const stock = await findStockPhoto(photoQuery)
  if (stock) return rehostImage(supabase, stock, keyHint)
  return null
}

// Cached Supabase client signed in as the app user — for callers that don't already have one
// (e.g. the extract function). Returns null if config/sign-in is unavailable. Never throws.
let _clientPromise = null
export function appClient() {
  if (_clientPromise) return _clientPromise
  _clientPromise = (async () => {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
    const email = process.env.APP_EMAIL
    const password = process.env.APP_PASSWORD
    if (!url || !key || !email || !password) return null
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return null
    return supabase
  })()
  _clientPromise.catch(() => { _clientPromise = null })
  return _clientPromise
}
