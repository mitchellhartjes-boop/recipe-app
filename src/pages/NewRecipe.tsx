import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RecipeForm from '../components/RecipeForm'
import { emptyValues, type CleanedRecipe } from '../lib/recipeForm'

// Type a recipe in by hand — grandma's card, a cookbook page, something you
// invented. Deliberately UNMETERED: the monthly limit exists to cover AI
// extraction costs, and typing costs us nothing, so it must never consume a
// slot or hit the paywall.
export default function NewRecipe() {
  const navigate = useNavigate()

  async function handleSave(clean: CleanedRecipe) {
    const { data, error } = await supabase
      .from('recipe_recipes')
      .insert({
        ...clean,
        source_platform: 'manual',
        status: 'saved',
        extraction_meta: { source_kind: 'manual' },
      })
      .select('id')
      .single()
    if (error) throw error
    navigate(`/recipe/${data.id}`, { replace: true })
  }

  return (
    <RecipeForm
      heading="Write a recipe"
      subtitle={
        <p className="mt-1 text-sm text-stone-500">
          For the ones that never had a link — family cards, cookbooks, your own inventions.
        </p>
      }
      initial={emptyValues()}
      submitLabel="Save to library"
      submittingLabel="Saving…"
      onSubmit={handleSave}
      onCancel={() => navigate('/')}
    />
  )
}
