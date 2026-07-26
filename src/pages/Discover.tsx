import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { openDiscoverBrowser, onSaveRequested, discoverBrowserAvailable } from '../lib/discoverBrowser'
import { apiUrl } from '../lib/api'
import { supabase } from '../lib/supabase'
import { SearchIcon } from '../components/icons'

// Discover: find a NEW recipe without leaving Dilla.
//
// Two modes, decided by the server (one probe at mount):
//  - results  (Phase 2, server-flagged): native result cards from a search API,
//    TikTok cards enriched via the platform's own oEmbed embedding interface —
//    one tap to import, or open the post in the browser.
//  - browser  (Phase 1, always available): the platform's own search opened in
//    the native browser with its persistent "Save this recipe" bar. Also the
//    fallback whenever results mode is off or a search errors.

type Platform = 'tiktok' | 'pinterest' | 'instagram' | 'web'

type SearchResult = {
  platform: Platform
  url: string
  title: string
  snippet?: string | null
  author?: string | null
  thumbnail?: string | null
}

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

const CTX = Capacitor.isNativePlatform() ? 'native' : 'web'

async function callSearch(body: Record<string, unknown>): Promise<{ enabled: boolean; results?: SearchResult[]; message?: string }> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  const res = await fetch(apiUrl('/.netlify/functions/discover-search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...body, ctx: CTX }),
  })
  const parsed = (await res.json().catch(() => null)) as { enabled?: boolean; results?: SearchResult[]; message?: string } | null
  return { enabled: Boolean(parsed?.enabled), results: parsed?.results, message: parsed?.message }
}

export default function Discover() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const native = useMemo(() => discoverBrowserAvailable(), [])

  // Phase 2 state. resultsMode stays false until the server says otherwise, so
  // a dark flag (or any probe failure) leaves the tab exactly as Phase 1.
  const [resultsMode, setResultsMode] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void callSearch({ probe: true })
      .then((r) => {
        if (!cancelled && r.enabled) setResultsMode(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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

  async function search(q: string, p: Platform = platform) {
    const clean = q.trim()
    if (!clean) return
    remember(clean)

    if (!resultsMode) {
      void openDiscoverBrowser(searchUrl(p, clean))
      return
    }

    setSearching(true)
    setNotice(null)
    setResults(null)
    try {
      const r = await callSearch({ query: clean, platform: p })
      if (!r.enabled) {
        // The flag went dark between probe and search — fall back seamlessly.
        setResultsMode(false)
        void openDiscoverBrowser(searchUrl(p, clean))
        return
      }
      setResults(r.results ?? [])
      if (r.message && !(r.results ?? []).length) setNotice(r.message)
    } catch {
      // Results mode is an enhancement; the browser always works.
      void openDiscoverBrowser(searchUrl(p, clean))
    } finally {
      setSearching(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void search(query)
  }

  const platformLabel = PLATFORMS.find((p) => p.key === platform)?.label

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Discover</h1>
      <p className="mt-2 text-sm text-stone-500">
        Craving something? Search TikTok, Pinterest, or the web — anything that looks good saves
        straight to your library.
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
          disabled={!query.trim() || searching}
          className="mt-4 w-full rounded-xl bg-paprika-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98] disabled:opacity-50"
        >
          {searching ? 'Searching…' : `Search ${platformLabel}`}
        </button>

        {!native && !resultsMode && (
          <p className="mt-3 text-xs text-stone-400">
            On the web, search opens in a new tab — copy the recipe's link and paste it in{' '}
            <b>Add</b>. In the iPhone app you get a save button right in the browser.
          </p>
        )}
      </form>

      {notice && <p className="mt-4 rounded-xl bg-paprika-50 px-4 py-3 text-sm text-paprika-800">{notice}</p>}

      {results !== null && !searching && (
        <div className="mt-6 space-y-2.5">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              {results.length ? `${results.length} found` : 'No results'}
            </h2>
            <button
              onClick={() => void openDiscoverBrowser(searchUrl(platform, query))}
              className="text-xs font-medium text-paprika-700 hover:underline"
            >
              Browse on {platformLabel} →
            </button>
          </div>

          {results.length === 0 && (
            <p className="rounded-2xl bg-paper px-4 py-6 text-center text-sm text-stone-500 shadow-card">
              Nothing found — try different words, or browse {platformLabel} directly.
            </p>
          )}

          {results.map((r) => (
            <div key={r.url} className="flex items-stretch gap-3 rounded-2xl bg-paper p-3 shadow-card">
              <button
                onClick={() => void openDiscoverBrowser(r.url)}
                className="shrink-0 overflow-hidden rounded-xl transition active:scale-95"
                aria-label="View the post"
              >
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt="" loading="lazy" className="h-[72px] w-[72px] object-cover" />
                ) : (
                  <span className="flex h-[72px] w-[72px] items-center justify-center bg-paprika-50 text-2xl">
                    {PLATFORMS.find((p) => p.key === r.platform)?.emoji ?? '🍽️'}
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <button onClick={() => void openDiscoverBrowser(r.url)} className="text-left">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{r.title}</p>
                  <p className="mt-0.5 truncate text-xs text-stone-400">
                    {r.author ? `${r.author} · ` : ''}
                    {PLATFORMS.find((p) => p.key === r.platform)?.label}
                  </p>
                </button>
                <div className="mt-auto flex items-center gap-2 pt-1.5">
                  <button
                    onClick={() => navigate('/add', { state: { url: r.url, auto: true } })}
                    className="rounded-full bg-paprika-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-95"
                  >
                    Save to Dilla
                  </button>
                  <button
                    onClick={() => void openDiscoverBrowser(r.url)}
                    className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-500 transition hover:text-paprika-700"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results === null && (
        <>
          {recent.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Recent</h2>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setQuery(r)
                      void search(r)
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
                    void search(idea)
                  }}
                  className="rounded-full bg-paprika-50 px-3 py-1.5 text-xs font-medium text-paprika-800 transition active:scale-95"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
