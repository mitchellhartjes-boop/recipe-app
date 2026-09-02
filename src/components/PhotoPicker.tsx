import { useRef, useState } from 'react'
import { prepareImage } from '../lib/imageCapture'
import { uploadPhoto } from '../lib/api'
import { CloseIcon } from './icons'

// Put your own photo on a recipe.
//
// A recipe that came from a reel arrives with the creator's cover already
// attached. One typed in by hand, or read off a photographed cookbook page, has
// nothing — and those are exactly the recipes someone actually cooks, so they
// sat in the library as anonymous gradient cards while imported ones looked
// real. The person cooking it is the only one who can supply that photo.
//
// TWO separate inputs, not one. `capture="environment"` opens the camera
// straight away, which is right when the food is in front of you and wrong when
// the photo is already in your library — iOS gives no way back to the library
// from a capture-hinted input. Offering both is the only way to serve both.
export default function PhotoPicker({
  value,
  onChange,
  hint,
}: {
  value: string | null
  onChange: (url: string | null) => void
  /** Used to name the stored file, so the bucket stays browsable. */
  hint?: string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const img = await prepareImage(file)
      // Show it immediately. The upload takes a moment on a phone connection,
      // and a picker that looks inert until it finishes reads as broken.
      setPreview(img.preview)
      const url = await uploadPhoto(img.base64, img.mediaType, hint)
      onChange(url)
      setPreview(null)
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "That photo couldn't be saved.")
    } finally {
      setBusy(false)
      // Clear both inputs so picking the SAME file again still fires onChange.
      if (cameraRef.current) cameraRef.current.value = ''
      if (libraryRef.current) libraryRef.current.value = ''
    }
  }

  const shown = preview ?? value

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">Photo of the food</label>

      {shown ? (
        <div className="relative w-fit">
          <img
            src={shown}
            alt=""
            className={`h-32 w-32 rounded-xl object-cover shadow-card transition ${busy ? 'opacity-50' : ''}`}
          />
          {!busy && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setError(null)
              }}
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-800 text-white shadow-card"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <p className="mb-2 text-xs text-stone-400">
          No photo yet. Add one and it shows on the recipe card in your library.
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-60 dark:bg-stone-100"
        >
          {busy ? 'Saving…' : shown ? 'Retake' : 'Take photo'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-60 dark:bg-stone-100"
        >
          Choose photo
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
