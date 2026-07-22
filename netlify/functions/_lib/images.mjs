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

// Find a representative stock photo from Pexels. Returns a direct image URL, or
// null (no key, no match, any error). Never throws.
//
// NOTE: this is for CATEGORY TILE artwork only — decorative imagery for a
// *group* of recipes, like "Italian" or "Tacos". It is deliberately NOT used
// for recipe covers: attaching a stock photo of a similar-but-different dish to
// a specific recipe reads as a photo of the thing you're about to cook, and
// isn't. See coverImage() below.
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
    return photo.src?.large || photo.src?.landscape || photo.src?.original || photo.src?.medium || null
  } catch {
    return null
  }
}

// Resolve a permanent cover for a recipe: re-host the source image so the URL
// never rots. Returns a permanent public URL, or null — in which case the app
// shows its designed gradient + category-emoji card (see RecipeCover.tsx).
//
// NOTE: we deliberately do NOT fetch a stock photo of a *similar* dish as a
// fallback. A generic photo of someone else's food attached to your recipe is
// quietly misleading — it looks like a photo of the thing you're about to cook
// and isn't. The designed card is honest about having no photo, and the real
// fix is the user's own "I made this" photo (which is also copyright-clean).
export async function coverImage(supabase, { srcUrl, keyHint = 'recipe' }) {
  return rehostImage(supabase, srcUrl, keyHint)
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
