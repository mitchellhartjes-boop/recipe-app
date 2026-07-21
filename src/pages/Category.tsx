import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useRecipes } from '../lib/useRecipes'
import { categoryBySlug, recipeInCategory } from '../lib/categories'
import RecipeCard from '../components/RecipeCard'

export default function Category() {
  const { slug } = useParams()
  const isAll = slug === 'all'
  const category = categoryBySlug(slug)
  const { recipes, loading } = useRecipes()

  const list = useMemo(() => {
    if (isAll) return recipes
    if (!category) return []
    return recipes.filter((r) => recipeInCategory(r, category))
  }, [recipes, isAll, category])

  if (!isAll && !category) return <Navigate to="/" replace />
  const label = isAll ? 'All recipes' : category!.label
  const emoji = isAll ? '🍽️' : category!.emoji

  return (
    <div className="space-y-5">
      {/* Mobile shows the title in the top bar; desktop gets a heading here. */}
      <div className="hidden items-end justify-between sm:flex">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{label}</h1>
        {list.length > 0 && <span className="text-sm text-stone-400">{list.length}</span>}
      </div>

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
