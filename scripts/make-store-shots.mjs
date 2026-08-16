// App Store screenshot builder: scrub creator identities, then frame each
// shot on a warm dark canvas with a headline. Outputs 1320x2868 PNGs.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, 'pics')

// Source screenshots are 1320x2868 (6.9"). Each profile renders the same
// design at a store-accepted size; layout constants scale off the width.
const PROFILES = [
  { name: 'store-6.9', W: 1320, H: 2868 },
  { name: 'store-6.5', W: 1284, H: 2778 },
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

async function samplePx(img, x, y) {
  const { data } = await sharp(img).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `rgb(${data[0]},${data[1]},${data[2]})`
}

async function applyScrubs(srcPath, scrubs) {
  let base = sharp(srcPath)
  const overlays = []
  for (const s of scrubs) {
    if (s.type === 'cover') {
      const color = await samplePx(srcPath, s.sample.x, s.sample.y)
      const svg = `<svg width="${s.rect.w}" height="${s.rect.h}"><rect width="100%" height="100%" rx="6" fill="${color}"/></svg>`
      overlays.push({ input: Buffer.from(svg), left: s.rect.x, top: s.rect.y })
    } else if (s.type === 'blur') {
      const region = await sharp(srcPath)
        .extract({ left: s.rect.x, top: s.rect.y, width: s.rect.w, height: s.rect.h })
        .blur(18)
        .toBuffer()
      overlays.push({ input: region, left: s.rect.x, top: s.rect.y })
    }
  }
  return overlays.length ? base.composite(overlays).toBuffer() : base.toBuffer()
}

async function frame(scrubbed, title, outPath, { W, H }) {
  const s = W / 1320 // layout scale relative to the design size
  const SHOT_W = Math.round(1132 * s)
  const SHOT_H = Math.round(SHOT_W * (2868 / 1320)) // preserve source aspect
  const SHOT_X = Math.round((W - SHOT_W) / 2)
  const SHOT_Y = Math.round(370 * s)
  const RADIUS = Math.round(56 * s)

  const shot = await sharp(scrubbed).resize(SHOT_W, SHOT_H).toBuffer()
  const mask = Buffer.from(
    `<svg width="${SHOT_W}" height="${SHOT_H}"><rect width="100%" height="100%" rx="${RADIUS}" fill="#fff"/></svg>`,
  )
  const rounded = await sharp(shot).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()

  const bg = `<svg width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#241C16"/>
        <stop offset="0.45" stop-color="#1A1411"/>
        <stop offset="1" stop-color="#100D0B"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.06" r="0.75">
        <stop offset="0" stop-color="#C2410C" stop-opacity="0.16"/>
        <stop offset="0.55" stop-color="#C2410C" stop-opacity="0.03"/>
        <stop offset="1" stop-color="#C2410C" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <text x="${W / 2}" y="${Math.round(212 * s)}" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(74 * s)}" font-weight="700" fill="#F4EDE3" text-anchor="middle">${esc(title)}</text>
    <rect x="${W / 2 - Math.round(70 * s)}" y="${Math.round(266 * s)}" width="${Math.round(140 * s)}" height="${Math.round(10 * s)}" rx="${Math.round(5 * s)}" fill="#EA580C"/>
  </svg>`

  const stroke = Buffer.from(
    `<svg width="${SHOT_W}" height="${SHOT_H}"><rect x="1.5" y="1.5" width="${SHOT_W - 3}" height="${SHOT_H - 3}" rx="${RADIUS}" fill="none" stroke="#F4EDE3" stroke-opacity="0.10" stroke-width="3"/></svg>`,
  )

  await sharp(Buffer.from(bg))
    .composite([
      { input: rounded, left: SHOT_X, top: SHOT_Y },
      { input: stroke, left: SHOT_X, top: SHOT_Y },
    ])
    .png()
    .toFile(outPath)
}

const SHOTS = [
  {
    src: 'IMG_1979.PNG', out: '02-recipe.png', title: 'Clean, complete, ready to cook',
    scrubs: [
      { type: 'blur', rect: { x: 412, y: 1928, w: 365, h: 64 } }, // creator name
      { type: 'blur', rect: { x: 408, y: 1980, w: 475, h: 60 } }, // source domain
    ],
  },
  {
    src: 'IMG_1988.PNG', out: '03-cookmode.png', title: 'Step-by-step, timers built in',
    scrubs: [
      { type: 'cover', rect: { x: 24, y: 104, w: 220, h: 54 }, sample: { x: 600, y: 120 } }, // TestFlight back-link
      { type: 'cover', rect: { x: 395, y: 285, w: 470, h: 52 }, sample: { x: 1000, y: 360 } }, // header creator credit
    ],
  },
  {
    src: 'IMG_1974.PNG', out: '04-library.png', title: 'Your recipes, finally organized',
    scrubs: [],
  },
  {
    src: 'IMG_1978.PNG', out: '05-discover.png', title: 'Find it. Save it. Cook it.',
    scrubs: [],
  },
  {
    src: 'IMG_1975.PNG', out: '06-collection.png', title: 'Search your whole collection',
    scrubs: [
      { type: 'cover', rect: { x: 80, y: 1348, w: 300, h: 58 }, sample: { x: 60, y: 1377 } },
      { type: 'cover', rect: { x: 708, y: 1341, w: 500, h: 60 }, sample: { x: 695, y: 1371 } },
      { type: 'cover', rect: { x: 80, y: 2038, w: 330, h: 58 }, sample: { x: 60, y: 2067 } },
      { type: 'cover', rect: { x: 708, y: 2103, w: 290, h: 58 }, sample: { x: 695, y: 2132 } },
    ],
  },
  {
    src: 'IMG_1977.PNG', out: '07-grocery.png', title: 'Recipe to grocery list in a tap',
    scrubs: [],
  },
]

// The Dilla mark from public/favicon.svg, embeddable at any size.
const dillaMark = (x, y, size) => `
  <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#c2410c"/>
    <path d="M32 13 L16 43 Q32 49 48 43 Z" fill="#f4c878" stroke="#f4c878" stroke-width="4" stroke-linejoin="round"/>
    <path d="M17.6 42 Q32 48 46.4 42" fill="none" stroke="#fff1d1" stroke-width="3.6" stroke-linecap="round"/>
    <g fill="#d98b35"><circle cx="29" cy="27" r="1.9"/><circle cx="37.5" cy="33" r="1.5"/><circle cx="30" cy="36" r="1.3"/></g>
  </svg>`

// Lead marketing shot: the share story — reel → Dilla → notification → the
// written-out recipe. This is the differentiator no raw screenshot can show.
async function makeHero(outPath, { W, H }) {
  const s = W / 1320
  const dash = (x, y, w, h, fill = '#3A322A') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`

  // Reel card geometry
  const rc = { x: 150 * s, y: 570 * s, w: 460 * s, h: 740 * s }
  const playCx = rc.x + rc.w / 2
  const playCy = rc.y + 300 * s
  // Recipe result card
  const cc = { x: (W - 1020 * s) / 2, y: 1700 * s, w: 1020 * s, h: 1040 * s }
  const pad = 70 * s
  const stepRow = (n, y, lw) => `
    <circle cx="${cc.x + pad + 22 * s}" cy="${y}" r="${22 * s}" fill="#C2410C"/>
    <text x="${cc.x + pad + 22 * s}" y="${y + 10 * s}" font-family="Segoe UI, Arial" font-size="${28 * s}" font-weight="600" fill="#fff" text-anchor="middle">${n}</text>
    ${dash(cc.x + pad + 64 * s, y - 8 * s, lw * s, 16 * s)}`

  const svg = `<svg width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#241C16"/><stop offset="0.45" stop-color="#1A1411"/><stop offset="1" stop-color="#100D0B"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.06" r="0.75">
        <stop offset="0" stop-color="#C2410C" stop-opacity="0.16"/><stop offset="0.55" stop-color="#C2410C" stop-opacity="0.03"/><stop offset="1" stop-color="#C2410C" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <text x="${W / 2}" y="${212 * s}" font-family="Georgia, serif" font-size="${74 * s}" font-weight="700" fill="#F4EDE3" text-anchor="middle">Share a reel. Get the recipe.</text>
    <rect x="${W / 2 - 70 * s}" y="${266 * s}" width="${140 * s}" height="${10 * s}" rx="${5 * s}" fill="#EA580C"/>
    <text x="${W / 2}" y="${372 * s}" font-family="Georgia, serif" font-style="italic" font-size="${46 * s}" fill="#C7BBAB" text-anchor="middle">Even when it&#8217;s only spoken in the video</text>
    <text x="${W / 2}" y="${446 * s}" font-family="Segoe UI, Arial" font-size="${36 * s}" fill="#8A7D6E" text-anchor="middle">The video stays on the platform &#8212; Dilla writes the recipe down</text>

    <!-- the reel -->
    <rect x="${rc.x}" y="${rc.y}" width="${rc.w}" height="${rc.h}" rx="${44 * s}" fill="#262019" stroke="#F4EDE3" stroke-opacity="0.08" stroke-width="${3 * s}"/>
    <circle cx="${playCx}" cy="${playCy}" r="${78 * s}" fill="#FFFFFF" fill-opacity="0.92"/>
    <path d="M ${playCx - 24 * s} ${playCy - 42 * s} L ${playCx + 44 * s} ${playCy} L ${playCx - 24 * s} ${playCy + 42 * s} Z" fill="#1C1815"/>
    <circle cx="${rc.x + 66 * s}" cy="${rc.y + rc.h - 150 * s}" r="${24 * s}" fill="#3A322A"/>
    ${dash(rc.x + 106 * s, rc.y + rc.h - 162 * s, 170 * s, 20 * s)}
    ${dash(rc.x + 44 * s, rc.y + rc.h - 96 * s, 310 * s, 18 * s)}
    ${dash(rc.x + 44 * s, rc.y + rc.h - 56 * s, 220 * s, 18 * s)}

    <!-- arrow -->
    <line x1="${656 * s}" y1="${940 * s}" x2="${800 * s}" y2="${940 * s}" stroke="#EA580C" stroke-width="${14 * s}" stroke-linecap="round"/>
    <path d="M ${796 * s} ${902 * s} L ${852 * s} ${940 * s} L ${796 * s} ${978 * s}" fill="none" stroke="#EA580C" stroke-width="${14 * s}" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Dilla -->
    ${dillaMark(880 * s, 780 * s, 320 * s)}

    <!-- notification -->
    <rect x="${(W - 760 * s) / 2}" y="${1440 * s}" width="${760 * s}" height="${116 * s}" rx="${58 * s}" fill="#F4EDE3"/>
    ${dillaMark((W - 760 * s) / 2 + 26 * s, 1462 * s, 72 * s)}
    <text x="${(W - 760 * s) / 2 + 128 * s}" y="${1514 * s}" font-family="Segoe UI, Arial" font-size="${44 * s}" font-weight="600" fill="#1C1815">Recipe saved</text>
    <path d="M ${(W - 760 * s) / 2 + 620 * s} ${1498 * s} l ${22 * s} ${24 * s} l ${44 * s} ${-48 * s}" fill="none" stroke="#C2410C" stroke-width="${12 * s}" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- the written-out recipe -->
    <rect x="${cc.x}" y="${cc.y}" width="${cc.w}" height="${cc.h}" rx="${56 * s}" fill="#241E19" stroke="#F4EDE3" stroke-opacity="0.08" stroke-width="${3 * s}"/>
    <text x="${cc.x + pad}" y="${cc.y + 130 * s}" font-family="Georgia, serif" font-size="${62 * s}" font-weight="700" fill="#F4EDE3">Creamy Tuscan Pasta</text>
    <text x="${cc.x + pad}" y="${cc.y + 196 * s}" font-family="Segoe UI, Arial" font-size="${36 * s}" fill="#9A8D7E">25 min &#183; serves 4</text>
    <text x="${cc.x + pad}" y="${cc.y + 300 * s}" font-family="Segoe UI, Arial" font-size="${30 * s}" font-weight="600" letter-spacing="${3 * s}" fill="#8A7D6E">INGREDIENTS</text>
    <circle cx="${cc.x + pad + 10 * s}" cy="${cc.y + 360 * s}" r="${9 * s}" fill="#C2410C"/>${dash(cc.x + pad + 40 * s, cc.y + 352 * s, 430 * s, 16 * s)}
    <circle cx="${cc.x + pad + 10 * s}" cy="${cc.y + 420 * s}" r="${9 * s}" fill="#C2410C"/>${dash(cc.x + pad + 40 * s, cc.y + 412 * s, 350 * s, 16 * s)}
    <circle cx="${cc.x + pad + 10 * s}" cy="${cc.y + 480 * s}" r="${9 * s}" fill="#C2410C"/>${dash(cc.x + pad + 40 * s, cc.y + 472 * s, 500 * s, 16 * s)}
    <text x="${cc.x + pad}" y="${cc.y + 600 * s}" font-family="Segoe UI, Arial" font-size="${30 * s}" font-weight="600" letter-spacing="${3 * s}" fill="#8A7D6E">STEPS</text>
    ${stepRow(1, cc.y + 670 * s, 620)}
    ${stepRow(2, cc.y + 770 * s, 540)}
    ${stepRow(3, cc.y + 870 * s, 660)}
  </svg>`

  await sharp(Buffer.from(svg)).png().toFile(outPath)
}

for (const profile of PROFILES) {
  const outDir = join(import.meta.dirname, profile.name)
  mkdirSync(outDir, { recursive: true })
  await makeHero(join(outDir, '01-share-story.png'), profile)
  console.log('done', profile.name, '01-share-story.png')
  for (const s of SHOTS) {
    const scrubbed = await applyScrubs(join(SRC, s.src), s.scrubs)
    await frame(scrubbed, s.title, join(outDir, s.out), profile)
    console.log('done', profile.name, s.out)
  }
}
