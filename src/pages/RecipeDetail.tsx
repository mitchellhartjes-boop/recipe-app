import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Recipe } from '../lib/types'

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await supabase.from('recipe_recipes').select('*').eq('id', id).single()
      if (!active) return
      if (error) setError(error.message)
      else setRecipe(data as Recipe)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [id])

  async function toggleFavorite() {
    if (!recipe) return
    const next = !recipe.favorite
    setRecipe({ ...recipe, favorite: next })
    await supabase.from('recipe_recipes').update({ favorite: next }).eq('id', recipe.id)
  }

  async function remove() {
    if (!recipe || !confirm('Delete this recipe?')) return
    await supabase.from('recipe_recipes').delete().eq('id', recipe.id)
    navigate('/', { replace: true })
  }

  if (loading) return <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
  if (error || !recipe)
    return (
      <div className="py-20 text-center text-sm text-stone-500">
        {error ?? 'Recipe not found.'} <Link to="/" className="text-paprika-700 hover:underline">Back to library</Link>
      </div>
    )

  const times = [
    recipe.prep_minutes ? `${recipe.prep_minutes}m prep` : null,
    recipe.cook_minutes ? `${recipe.cook_minutes}m cook` : null,
    recipe.servings ? `serves ${recipe.servings}` : null,
  ].filter(Boolean)

  return (
    <article className="mx-auto max-w-2xl pb-20">
      {recipe.image_url && (
        <img src={recipe.image_url} alt="" className="mb-6 h-60 w-full rounded-2xl object-cover shadow-card" />
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{recipe.title}</h1>
        <button
          onClick={toggleFavorite}
          className="shrink-0 rounded-full p-2 text-2xl leading-none transition hover:bg-stone-100"
          aria-label="Favorite"
          title="Favorite"
        >
          {recipe.favorite ? '★' : '☆'}
        </button>
      </div>

      {recipe.description && <p className="mt-2 text-stone-600">{recipe.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
        {times.length > 0 && <span>{times.join(' · ')}</span>}
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-paprika-700 hover:underline">
            {recipe.source_author || 'source'} ↗
          </a>
        )}
      </div>

      {recipe.tags?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <span key={t} className="rounded-full bg-paprika-50 px-3 py-1 text-xs font-medium text-paprika-800">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_1.4fr]">
        <section>
          <h2 className="font-display text-xl font-semibold">Ingredients</h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients?.map((ing, i) => (
              <li key={i} className="flex gap-2 text-sm text-stone-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-paprika-300" />
                <span>{ing.raw}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Steps</h2>
          <ol className="mt-3 space-y-3">
            {recipe.steps?.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-stone-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paprika-700 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.notes && (
        <div className="mt-8 rounded-2xl bg-paprika-50/60 p-5">
          <h3 className="font-display text-base font-semibold">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{recipe.notes}</p>
        </div>
      )}

      <div className="mt-10 flex items-center gap-4">
        <Link to="/" className="text-sm font-medium text-stone-500 hover:text-stone-700">← Library</Link>
        <button onClick={remove} className="text-sm font-medium text-stone-400 transition hover:text-red-600">
          Delete
        </button>
      </div>
    </article>
  )
}
