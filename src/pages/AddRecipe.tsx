import { useEffect, useRef, useState, type FormEvent } from 'react'
import { noteFrustration } from '../lib/reviewPrompt'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { extractRecipe, createJob } from '../lib/api'

export default function AddRecipe() {
  const navigate = useNavigate()
  const location = useLocation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRan = useRef(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await run(url.trim())
  }

  async function run(link: string) {
    if (!link) return
    setBusy(true)
    setError(null)
    try {
      const result = await extractRecipe(link)

      // Fast path: caption or website extracted synchronously -> review now.
      if (result.ok) {
        navigate('/review', { state: { draft: result.recipe, banner: null } })
        return
      }

      // Recipe is in the video -> hand off to the worker queue; it appears in the library live.
      if (result.reason === 'video_only') {
        await createJob(link, 'video', {})
        navigate('/', { state: { queued: 'video' } })
        return
      }

      // Out of monthly imports -> the paywall IS the answer, not an error state.
      if (result.reason === 'limit_reached') {
        noteFrustration() // hit a wall — don't ask for a rating this session
        // Carry the REASON. Landing on the paywall with no explanation reads as
        // "this feature is Pro-only" rather than "you've used this month's
        // imports" — which is what it actually is, and a very different thing.
        navigate('/upgrade', { state: { reason: result.message } })
        return
      }

      // link_in_bio (open the blog link & share it), inaccessible, or no recipe -> show the message
      // on the review screen so the user can act on it or enter the recipe manually.
      navigate('/review', { state: { draft: result.draft, banner: { kind: 'info', text: result.message } } })
    } catch (err) {
      noteFrustration() // a failed import is the worst moment to ask for a rating
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // The Discover browser's "Save this recipe" lands here with the page URL and
  // runs the import immediately — same flow as pasting the link, zero retyping.
  // (Placed after run() so lint sees the declaration first.)
  useEffect(() => {
    const state = location.state as { url?: string; auto?: boolean } | null
    if (!state?.url || autoRan.current) return
    autoRan.current = true
    setUrl(state.url)
    if (state.auto) void run(state.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Add a recipe</h1>
      <p className="mt-2 text-sm text-stone-500">
        Paste an Instagram reel, a TikTok, a recipe website, or a Pinterest link. Captions and
        websites come back instantly; posts that hide the recipe in the video get queued and appear
        in your library a minute later.
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
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 disabled:opacity-60 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
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
        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </form>

      {/* No link to paste? Typing one in is free and unmetered — the monthly
          limit exists to cover AI extraction, and this costs nothing. */}
      <p className="mt-5 text-center text-sm text-stone-500">
        No link to paste?{' '}
        <Link to="/new" className="font-medium text-paprika-700 hover:underline">
          Write a recipe yourself
        </Link>
      </p>
    </div>
  )
}
