// Photo for a user-created category tile.
//
// The built-in categories ship committed photos in public/categories/. A
// category the user invents ("Italian", "Tacos") has no such file, so the tile
// fell back to a gradient + emoji while every neighbouring tile showed real
// food photography — visibly inconsistent.
//
// This fetches a representative photo from Pexels (the same free, licensed
// source already used for recipe covers) and re-hosts it to Supabase Storage so
// the URL is permanent and the tile loads fast.
//
// GET /.netlify/functions/category-photo?label=Italian
//   -> { url: "https://...supabase.co/storage/.../category-italian-xxx.jpg" }
//   -> { url: null }  when nothing suitable is found (caller shows the emoji card)
import { findStockPhoto, rehostImage, appClient } from './_lib/images.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', ...CORS },
  })

// A bare category name makes a poor image search ("Breakfast" returns stock
// photos of the word). Anchoring it to food gets an appetising dish shot.
function photoQuery(label) {
  const l = label.trim().toLowerCase()
  const CUISINES = new Set([
    'italian', 'mexican', 'asian', 'chinese', 'japanese', 'thai', 'korean',
    'indian', 'greek', 'french', 'spanish', 'vietnamese', 'mediterranean',
    'american', 'german', 'moroccan', 'turkish', 'lebanese', 'cuban',
  ])
  if (CUISINES.has(l)) return `${l} food dish`
  return `${l} food`
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const label = new URL(req.url).searchParams.get('label')?.trim()
  if (!label) return json({ url: null, message: 'label is required' }, 400)

  try {
    const src = await findStockPhoto(photoQuery(label))
    if (!src) return json({ url: null })

    // Re-hosting downloads the image and uploads it to Storage, which can
    // exceed Netlify's ~10s synchronous function budget and kill the whole
    // request — the tile then gets nothing at all. Race it against a timeout
    // and fall back to Pexels' own CDN URL, which works immediately and is a
    // perfectly good tile image; it just isn't permanent.
    const supabase = await appClient()
    const hosted = supabase
      ? await Promise.race([
          rehostImage(supabase, src, `category-${label}`),
          new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
        ])
      : null

    return json({ url: hosted || src })
  } catch {
    // Never fail the UI over a decorative image.
    return json({ url: null })
  }
}
