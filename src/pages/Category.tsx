import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { Recipe } from '../lib/types'
import { useRecipes } from '../lib/useRecipes'
import { categoryBySlug, recipeInCategory } from '../lib/categories'
import { useCategoryPrefs } from '../lib/useCategoryPrefs'
import { loadSort, saveSort, sortRecipes, type SortKey } from '../lib/recipeSort'
import RecipeCard from '../components/RecipeCard'
import SortMenu from '../components/SortMenu'
import { SearchIcon, CloseIcon } from '../components/icons'

// The library's search (formerly its own tab — folded in here so finding YOUR
// recipes happens where they live, and the Discover tab unambiguously means
// finding NEW ones). Matches every term against title, tags, author, and
// ingredients — "chicken thighs" finds a recipe whose title never says chicken.
function matches(r: Recipe, terms: string[]): boolean {
  const hay = `${r.title ?? ''} ${(r.tags ?? []).join(' ')} ${r.source_author ?? ''} ${(r.ingredients ?? [])
    .map((i) => i.item || i.raw || '')
    .join(' ')}`.toLowerCase()
  return terms.every((t) => hay.includes(t))
}

export default function Category() {
  const { slug } = useParams()
  const isAll = slug === 'all'
  // Look in the built-ins first, then the user's own custom categories.
  const { all } = useCategoryPrefs()
  const category = categoryBySlug(slug) ?? all.find((c) => c.slug === slug)
  const { recipes, loading } = useRecipes()
  const [sort, setSort] = useState<SortKey>(loadSort)
  const [q, setQ] = useState('')

  function changeSort(key: SortKey) {
    setSort(key)
    saveSort(key)
  }

  const searching = q.trim().length > 0

  const list = useMemo(() => {
    const base = isAll ? recipes : category ? recipes.filter((r) => recipeInCategory(r, category)) : []
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const found = terms.length ? base.filter((r) => matches(r, terms)) : base
    return sortRecipes(found, sort)
  }, [recipes, isAll, category, sort, q])

  if (!isAll && !category) return <Navigate to="/" replace />
  const label = isAll ? 'All recipes' : category!.label
  const emoji = isAll ? '🍽️' : category!.emoji

  return (
    <div className="space-y-5">
      {/* Mobile shows the title in the top bar; desktop gets a heading here. */}
      <div className="hidden sm:block">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{label}</h1>
      </div>

      {/* Search within this list — scoped to the category you're looking at,
          or your whole cookbook on "All". Hidden while the category is truly
          empty (nothing to search). */}
      {!loading && (list.length > 0 || searching) && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-paper px-4 py-3 shadow-card">
          <SearchIcon className="h-5 w-5 shrink-0 text-stone-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isAll ? 'Search by name, tag, ingredient…' : `Search ${label.toLowerCase()}…`}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-stone-400"
          />
          {q && (
            <button onClick={() => setQ('')} className="shrink-0 text-stone-400 transition hover:text-stone-600" aria-label="Clear search">
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Count + sort. Deliberately outside the heading block, which is
          desktop-only — this row is the only place the sort control can live on
          a phone. Hidden for a single recipe, where sorting means nothing. */}
      {!loading && list.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-400">
            {list.length} {searching ? (list.length === 1 ? 'match' : 'matches') : list.length === 1 ? 'recipe' : 'recipes'}
          </span>
          {list.length > 1 && <SortMenu value={sort} onChange={changeSort} />}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
      ) : list.length === 0 && searching ? (
        <div className="py-16 text-center">
          <p className="font-display text-lg font-semibold">No matches</p>
          <p className="mt-1 text-sm text-stone-500">Nothing found for “{q.trim()}”.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-3xl">{emoji}</div>
          <h2 className="font-display text-2xl font-semibold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
            When you save a recipe that fits “{label}”, it’ll show up here automatically.
          </p>
          <Link
            to="/add"
            className="mt-6 inline-block rounded-full bg-paprika-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800"
          >
            Add a recipe
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {list.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  )
}
