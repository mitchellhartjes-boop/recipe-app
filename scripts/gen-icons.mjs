// Generate PWA / apple-touch PNG icons from the bowl-mark.
// Run with: node scripts/gen-icons.mjs  (requires the dev dependency `sharp`)
//
// The artwork is the same bowl + steam as public/favicon.svg, but drawn
// full-bleed on a paprika field and padded so it survives Android's maskable
// crop and iOS's rounded-corner mask.
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Same wedge as public/favicon.svg (64x64), scaled ×8 onto a full-bleed paprika
// field. The favicon's rounded rect is dropped — the OS applies its own corner
// mask — and the artwork's built-in margin keeps it maskable-safe.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#c2410c"/>
  <g transform="scale(8)">
    <path d="M32 13 L16 43 Q32 49 48 43 Z" fill="#f4c878" stroke="#f4c878" stroke-width="4" stroke-linejoin="round"/>
    <path d="M17.6 42 Q32 48 46.4 42" fill="none" stroke="#fff1d1" stroke-width="3.6" stroke-linecap="round"/>
    <g fill="#d98b35">
      <circle cx="29" cy="27" r="1.9"/>
      <circle cx="37.5" cy="33" r="1.5"/>
      <circle cx="30" cy="36" r="1.3"/>
    </g>
  </g>
</svg>`

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['pwa-maskable-512x512.png', 512],
  ['apple-touch-icon.png', 180],
]

const buf = Buffer.from(svg)
for (const [name, size] of targets) {
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(resolve(out, name))
  console.log('wrote', name)
}
