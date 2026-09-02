import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { prepareImages, totalBytes, MAX_TOTAL_BYTES, type CapturedImage } from '../lib/imageCapture'
import { extractFromPhotos } from '../lib/api'
import { noteFrustration } from '../lib/reviewPrompt'
import { CloseIcon, PlusIcon } from './icons'

// Photograph a recipe that has no link.
//
// Cookbooks, recipe cards, a magazine, a page someone handed you. Until now the
// only way in was to screenshot it in another app and share the image to Dilla,
// which is a strange instruction to give someone holding a book.
//
// MULTIPLE pages, because that is the actual failure people hit: a long recipe
// does not fit in one frame, and photographing only what fits produced a
// confidently half-finished recipe instead of an obvious error. Pages are sent
// together and read as one document.
const MAX_PAGES = 5

export default function PhotoImport() {
  const navigate = useNavigate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<CapturedImage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addFiles(list: FileList | null) {
    if (!list?.length) return
    setError(null)
    try {
      const room = MAX_PAGES - pages.length
      if (room <= 0) {
        setError(`That's the ${MAX_PAGES}-page limit. Remove one to add another.`)
        return
      }
      const added = await prepareImages(Array.from(list).slice(0, room))
      const next = [...pages, ...added]
      if (totalBytes(next) > MAX_TOTAL_BYTES) {
        setError('Those photos are too large together. Try fewer pages.')
        return
      }
      setPages(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be read.")
    } finally {
      if (cameraRef.current) cameraRef.current.value = ''
      if (libraryRef.current) libraryRef.current.value = ''
    }
  }

  async function read() {
    if (!pages.length || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await extractFromPhotos(pages.map((p) => ({ base64: p.base64, mediaType: p.mediaType })))
      if (result.ok) {
        navigate('/review', { state: { draft: result.recipe, banner: null } })
        return
      }
      if (result.reason === 'limit_reached') {
        noteFrustration()
        navigate('/upgrade', { state: { reason: result.message } })
        return
      }
      // Anything else: keep the photos on screen. Making someone re-shoot a
      // cookbook page because we couldn't read it the first time is the
      // rudest possible response.
      noteFrustration()
      setError(result.message || "Couldn't read a recipe from those photos.")
    } catch (e) {
      noteFrustration()
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-paper p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold">No link? Photograph it</h2>
      <p className="mt-1 text-sm text-stone-500">
        A cookbook, a recipe card, something written down. If it runs onto another page, add that
        photo too — they’re read together as one recipe.
      </p>

      {pages.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pages.map((p, i) => (
            <div key={p.preview.slice(-24) + i} className="relative">
              <img src={p.preview} alt="" className="h-24 w-20 rounded-lg object-cover shadow-sm" />
              <span className="absolute bottom-1 left-1 rounded bg-stone-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {i + 1}
              </span>
              {!busy && (
                <button
                  type="button"
                  aria-label={`Remove page ${i + 1}`}
                  onClick={() => setPages(pages.filter((_, n) => n !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-stone-800 text-white shadow-card"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {pages.length < MAX_PAGES && !busy && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              aria-label="Add another page"
              className="flex h-24 w-20 items-center justify-center rounded-lg border-2 border-dashed border-stone-200 text-stone-400 transition hover:border-stone-300 hover:text-stone-600"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-60 dark:bg-stone-100"
        >
          {pages.length ? 'Take another' : 'Take a photo'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
          className="rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-60 dark:bg-stone-100"
        >
          Choose photos
        </button>
        {pages.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void read()}
            className="rounded-xl bg-paprika-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
          >
            {busy
              ? 'Reading…'
              : `Read ${pages.length === 1 ? 'this recipe' : `these ${pages.length} pages`}`}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Camera and library are separate inputs on purpose: capture="environment"
          jumps straight to the camera, and iOS offers no way back to the library
          from there. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void addFiles(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void addFiles(e.target.files)}
      />
    </div>
  )
}
