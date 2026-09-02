// Turning a phone photo into something we can actually send.
//
// Three features need this: photographing a recipe from the Add tab, adding
// more pages to a long recipe, and putting your own photo of the food on a
// recipe. All three start with a File from an <input> and all three hit the
// same three walls if you send it raw:
//
//   - a modern iPhone photo is 3-5 MB, and a Netlify function body caps out
//     well below what a few of those come to once base64 inflates them ~33%;
//   - Claude's vision resizes anything larger than ~1568px on its longest edge
//     anyway, so the extra pixels cost tokens and time and buy nothing;
//   - iOS hands over HEIC from the photo library. Safari decodes it natively,
//     so drawing it to a canvas and re-encoding gives us JPEG for free.
//
// Downscaling first solves all three at once.

/** Claude resizes above this internally, so sending more is pure waste. */
const MAX_EDGE = 1568
const JPEG_QUALITY = 0.82

export type CapturedImage = {
  /** base64 WITHOUT the data: prefix — the shape the API expects. */
  base64: string
  mediaType: 'image/jpeg'
  /** data: URL, for showing a thumbnail before upload. */
  preview: string
  bytes: number
}

/** Longest edge to MAX_EDGE, preserving aspect ratio. Never upscales. */
function targetSize(w: number, h: number) {
  const longest = Math.max(w, h)
  if (longest <= MAX_EDGE) return { w, h }
  const scale = MAX_EDGE / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      // Most likely a format the browser can't decode. Say something a person
      // can act on rather than surfacing a bare event.
      reject(new Error("That image couldn't be read. Try taking the photo again, or pick a different one."))
    }
    img.src = url
  })
}

/**
 * File -> downscaled JPEG. Throws with a user-readable message on failure,
 * because every caller of this puts the message straight on screen.
 */
export async function prepareImage(file: File): Promise<CapturedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file isn’t an image.')
  }
  const img = await loadImage(file)
  const { w, h } = targetSize(img.naturalWidth || img.width, img.naturalHeight || img.height)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser wouldn’t let us process that image.')
  ctx.drawImage(img, 0, 0, w, h)

  const preview = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = preview.slice(preview.indexOf(',') + 1)
  // base64 is 4 chars per 3 bytes; close enough for a size guard.
  const bytes = Math.round((base64.length * 3) / 4)
  return { base64, mediaType: 'image/jpeg', preview, bytes }
}

/** Prepare several at once, in the order the user picked them — page order
 *  matters when the pages are halves of one recipe. */
export async function prepareImages(files: File[]): Promise<CapturedImage[]> {
  const out: CapturedImage[] = []
  for (const f of files) out.push(await prepareImage(f))
  return out
}

/** Rough guard so a stack of photos can't exceed what a function body accepts. */
export const totalBytes = (images: CapturedImage[]) => images.reduce((n, i) => n + i.bytes, 0)
export const MAX_TOTAL_BYTES = 4_000_000
