import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Recipe } from '../lib/types'
import RecipeForm from '../components/RecipeForm'
import { valuesFrom, type CleanedRecipe } from '../lib/recipeForm'
import { derivedCategories } from '../lib/categories'

// Edit a saved recipe in place. Free for everyone, deliberately: a user's own
// recipe is their data, and gating corrections behind Pro reads as hostile.
// Source attribution (platform, URL, author, cover) is preserved untouched —
// editing your copy never erases where it came from.
export default function EditRecipe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error: dbError } = await supabase.from('recipe_recipes').select('*').eq('id', id).single()
      if (!active) return
      if (dbError) setError(dbError.message)
      else setRecipe(data as Recipe)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [id])

  async function handleSave(clean: CleanedRecipe) {
    const { error: dbError } = await supabase.from('recipe_recipes').update(clean).eq('id', id)
    if (dbError) throw dbError
    navigate(`/recipe/${id}`, { replace: true })
  }

  if (loading) return <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
  if (error || !recipe)
    return (
      <div className="py-20 text-center text-sm text-stone-500">
        {error ?? 'Recipe not found.'}{' '}
        <Link to="/" className="text-paprika-700 hover:underline">
          Back to library
        </Link>
      </div>
    )

  return (
    <RecipeForm
      heading="Edit recipe"
      subtitle={<p className="mt-1 text-sm text-stone-500">Changes save to your library only — the original post is untouched.</p>}
      imageUrl={recipe.image_url}
      initial={valuesFrom(recipe, derivedCategories(recipe))}
      submitLabel="Save changes"
      submittingLabel="Saving…"
      onSubmit={handleSave}
      onCancel={() => navigate(`/recipe/${id}`)}
    />
  )
}
