import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { openDiscoverBrowser, onSaveRequested, discoverBrowserAvailable } from '../lib/discoverBrowser'
import { SearchIcon } from '../components/icons'

// Discover: find a NEW recipe without leaving Dilla. The search opens the
// platform's own site (their search is far better than anything we could build)
// inside the native browser, whose persistent "Save this recipe" button hands
// the current page to the normal import pipeline.

type Platform = 'tiktok' | 'pinterest' | 'instagram' | 'web'

const PLATFORMS: { key: Platform; label: string; emoji: string }[] = [
  { key: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { key: 'pinterest', label: 'Pinterest', emoji: '📌' },
  { key: 'instagram', label: 'Instagram', emoji: '📷' },
  { key: 'web', label: 'Web', emoji: '🌐' },
]

function searchUrl(platform: Platform, query: string): string {
  const q = encodeURIComponent(query.trim())
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/search?q=${q}`
    case 'pinterest':
      return `https://www.pinterest.com/search/pins/?q=${q}`
    case 'instagram':
      // Instagram's keyword search wants a signed-in session; the browser keeps
      // the user's login between visits, so this works after one sign-in.
      return `https://www.instagram.com/explore/search/keyword/?q=${q}`
    case 'web':
      return `https://www.google.com/search?q=${q}%20recipe`
  }
}

// A few starters so the empty state invites a tap instead of a blank stare.
const IDEAS = ['chicken dinner', 'pasta', 'chocolate chip cookies', 'meal prep', 'air fryer', 'high protein']

const RECENT_KEY = 'dilla-discover-recent'

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

export default function Discover() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const native = useMemo(() => discoverBrowserAvailable(), [])

  // "Save this recipe" in the browser → run the same flow as pasting the link
  // on the Add screen (extract → review/queue/limit — all existing routing).
  useEffect(() => {
    const off = onSaveRequested((url) => {
      navigate('/add', { state: { url, auto: true } })
    })
    return off
  }, [navigate])

  function remember(q: string) {
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* private mode — recents just won't persist */
    }
  }

  function search(q: string, p: Platform = platform) {
    const clean = q.trim()
    if (!clean) return
    remember(clean)
    void openDiscoverBrowser(searchUrl(p, clean))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    search(query)
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Discover</h1>
      <p className="mt-2 text-sm text-stone-500">
        Craving something? Search TikTok, Pinterest, or the web — then tap{' '}
        <b>Save this recipe</b> on anything that looks good and it lands in your library.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl bg-paper p-5 shadow-card">
        <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 transition focus-within:border-paprika-400 focus-within:ring-2 focus-within:ring-paprika-100 dark:bg-stone-100 dark:focus-within:ring-paprika-900/40">
          <SearchIcon className="h-5 w-5 shrink-0 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to cook?"
            enterKeyHint="search"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-stone-400"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlatform(p.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                platform === p.key
                  ? 'bg-paprika-700 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={!query.trim()}
          className="mt-4 w-full rounded-xl bg-paprika-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98] disabled:opacity-50"
        >
          Search {PLATFORMS.find((p) => p.key === platform)?.label}
        </button>

        {!native && (
          <p className="mt-3 text-xs text-stone-400">
            On the web, search opens in a new tab — copy the recipe's link and paste it in{' '}
            <b>Add</b>. In the iPhone app you get a save button right in the browser.
          </p>
        )}
      </form>

      {recent.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Recent</h2>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setQuery(r)
                  search(r)
                }}
                className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm transition hover:text-paprika-700 active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Ideas</h2>
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              onClick={() => {
                setQuery(idea)
                search(idea)
              }}
              className="rounded-full bg-paprika-50 px-3 py-1.5 text-xs font-medium text-paprika-800 transition active:scale-95"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
