import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractRecipe, createJob } from '../lib/api'

export default function AddRecipe() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const link = url.trim()
    try {
      const result = await extractRecipe(link)

      // Fast path: caption or website extracted synchronously -> review now.
      if (result.ok) {
        navigate('/review', { state: { draft: result.recipe, banner: null } })
        return
      }

      // Slow paths: hand off to the worker queue, then show it processing in the library.
      if (result.reason === 'link_in_bio') {
        await createJob(link, 'link_in_bio', {
          title: result.recover?.title ?? result.draft.title,
          author: result.recover?.author ?? result.draft.source_author,
          externalUrl: result.recover?.externalUrl ?? null,
        })
        navigate('/', { state: { queued: 'link_in_bio' } })
        return
      }
      if (result.reason === 'video_only') {
        await createJob(link, 'video', {})
        navigate('/', { state: { queued: 'video' } })
        return
      }

      // No recipe found anywhere -> let the user enter it manually.
      navigate('/review', { state: { draft: result.draft, banner: { kind: 'info', text: result.message } } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Add a recipe</h1>
      <p className="mt-2 text-sm text-stone-500">
        Paste an Instagram reel, a recipe website, or a Pinterest link. Captions and websites come
        back instantly; reels that link out or hide the recipe in the video get queued for the
        background worker.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl bg-paper p-6 shadow-card">
        <label className="mb-1 block text-xs font-medium text-stone-500">Recipe link</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder="https://www.instagram.com/reel/…"
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-paprika-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
          >
            {busy ? 'Reading…' : 'Extract'}
          </button>
        </div>
        {busy && <p className="mt-3 text-sm text-stone-500">Working on it — just a few seconds.</p>}
        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </form>
    </div>
  )
}
