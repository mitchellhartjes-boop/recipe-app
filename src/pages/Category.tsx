import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useRecipes } from '../lib/useRecipes'
import { categoryBySlug, recipeInCategory } from '../lib/categories'
import { useCategoryPrefs } from '../lib/useCategoryPrefs'
import { loadSort, saveSort, sortRecipes, type SortKey } from '../lib/recipeSort'
import RecipeCard from '../components/RecipeCard'
import SortMenu from '../components/SortMenu'

export default function Category() {
  const { slug } = useParams()
  const isAll = slug === 'all'
  // Look in the built-ins first, then the user's own custom categories.
  const { all } = useCategoryPrefs()
  const category = categoryBySlug(slug) ?? all.find((c) => c.slug === slug)
  const { recipes, loading } = useRecipes()
  const [sort, setSort] = useState<SortKey>(loadSort)

  function changeSort(key: SortKey) {
    setSort(key)
    saveSort(key)
  }

  const list = useMemo(() => {
    const base = isAll ? recipes : category ? recipes.filter((r) => recipeInCategory(r, category)) : []
    return sortRecipes(base, sort)
  }, [recipes, isAll, category, sort])

  if (!isAll && !category) return <Navigate to="/" replace />
  const label = isAll ? 'All recipes' : category!.label
  const emoji = isAll ? '🍽️' : category!.emoji

  return (
    <div className="space-y-5">
      {/* Mobile shows the title in the top bar; desktop gets a heading here. */}
      <div className="hidden sm:block">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{label}</h1>
      </div>

      {/* Count + sort. Deliberately outside the block above, which is
          desktop-only — this row is the only place the sort control can live on
          a phone. Hidden for a single recipe, where sorting means nothing. */}
      {!loading && list.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-400">
            {list.length} {list.length === 1 ? 'recipe' : 'recipes'}
          </span>
          {list.length > 1 && <SortMenu value={sort} onChange={changeSort} />}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
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
