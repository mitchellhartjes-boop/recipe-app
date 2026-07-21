import { useEffect, useMemo, useRef, useState } from 'react'
import { useRecipes } from '../lib/useRecipes'
import RecipeCard from '../components/RecipeCard'
import { SearchIcon, CloseIcon } from '../components/icons'

export default function Search() {
  const { recipes, loading } = useRecipes()
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    return recipes.filter((r) => {
      const hay = `${r.title ?? ''} ${(r.tags ?? []).join(' ')} ${r.source_author ?? ''} ${(r.ingredients ?? [])
        .map((i) => i.item || i.raw || '')
        .join(' ')}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [q, recipes])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5 rounded-2xl bg-paper px-4 py-3 shadow-card">
        <SearchIcon className="h-5 w-5 shrink-0 text-stone-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, tag, ingredient…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
        />
        {q && (
          <button onClick={() => setQ('')} className="shrink-0 text-stone-400 transition hover:text-stone-600" aria-label="Clear">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!q ? (
        <p className="py-16 text-center text-sm text-stone-400">Find any recipe in your cookbook.</p>
      ) : loading ? (
        <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
      ) : results.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-display text-lg font-semibold">No matches</p>
          <p className="mt-1 text-sm text-stone-500">Nothing found for “{q}”.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-400">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {results.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
