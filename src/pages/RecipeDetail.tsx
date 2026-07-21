import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Recipe } from '../lib/types'
import { scaleIngredient, parseServings } from '../lib/scale'
import { groupIngredients } from '../lib/groupIngredients'
import { addGroceryItems } from '../lib/useGrocery'
import GrocerySheet from '../components/GrocerySheet'
import CookMode from '../components/CookMode'
import RecipeCover from '../components/RecipeCover'
import { StarIcon, ClockIcon, UsersIcon, MinusIcon, PlusIcon, CheckIcon, FlameIcon, CartIcon } from '../components/icons'

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [servingsOverride, setServingsOverride] = useState<number | null>(null)
  const [cooking, setCooking] = useState(false)
  const [cookStart, setCookStart] = useState(0)
  const [grocery, setGrocery] = useState<'idle' | 'added'>('idle')
  const [grocerySheet, setGrocerySheet] = useState(false)

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

  const baseServings = useMemo(() => (recipe ? parseServings(recipe.servings) : null), [recipe])
  // The chosen serving count. `null` until the user adjusts it, where it falls
  // back to the recipe's base — so this derives from state without an effect
  // (no extra render, no resetting the stepper when the recipe object changes).
  const defaultServings = baseServings != null ? Math.max(1, Math.round(baseServings)) : null
  const servings = servingsOverride ?? defaultServings

  const scale = baseServings && servings ? servings / baseServings : 1

  async function setRating(n: number) {
    if (!recipe) return
    const next = recipe.rating === n ? null : n
    setRecipe({ ...recipe, rating: next })
    await supabase.from('recipe_recipes').update({ rating: next }).eq('id', recipe.id)
  }

  function toggleCheck(i: number) {
    setChecked((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }

  async function remove() {
    if (!recipe || !confirm('Delete this recipe?')) return
    await supabase.from('recipe_recipes').delete().eq('id', recipe.id)
    navigate('/', { replace: true })
  }

  async function addToGrocery(names: string[]) {
    setGrocerySheet(false)
    if (!recipe || names.length === 0) return
    try {
      await addGroceryItems(names, recipe.id)
      setGrocery('added')
      setTimeout(() => setGrocery('idle'), 2200)
    } catch {
      setGrocery('idle')
    }
  }

  function startCooking(at = 0) {
    setCookStart(at)
    setCooking(true)
  }
  function closeCooking(finished?: boolean) {
    setCooking(false)
    if (finished) {
      setTimeout(() => document.getElementById('rating')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
  if (error || !recipe)
    return (
      <div className="py-20 text-center text-sm text-stone-500">
        {error ?? 'Recipe not found.'}{' '}
        <Link to="/" className="text-paprika-700 hover:underline">Back to library</Link>
      </div>
    )

  const ingredients = recipe.ingredients ?? []
  const steps = recipe.steps ?? []
  const scaledIngredients = ingredients.map((ing) => scaleIngredient(ing.raw, scale))
  const ingredientGroups = groupIngredients(ingredients)
  const times = [
    recipe.prep_minutes ? `${recipe.prep_minutes}m prep` : null,
    recipe.cook_minutes ? `${recipe.cook_minutes}m cook` : null,
  ].filter(Boolean) as string[]
  const summedTime = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0)
  const totalTime = recipe.total_minutes ?? (summedTime > 0 ? summedTime : null)

  return (
    <article className="mx-auto max-w-2xl pb-24">
      <div className="mb-5 h-56 overflow-hidden rounded-2xl shadow-card sm:h-72">
        <RecipeCover recipe={recipe} emojiClass="text-7xl" />
      </div>

      <h1 className="font-display text-3xl font-semibold tracking-tight">{recipe.title}</h1>

      <div id="rating" className="mt-2 flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className="p-0.5 transition active:scale-90" aria-label={`Rate ${n} of 5`}>
            <StarIcon className="h-6 w-6 text-amber-400" filled={(recipe.rating ?? 0) >= n} />
          </button>
        ))}
        <span className="ml-1.5 text-xs text-stone-400">{recipe.rating ? `${recipe.rating}/5` : 'Tap to rate'}</span>
      </div>

      {recipe.description && <p className="mt-3 text-stone-600">{recipe.description}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {totalTime ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm">
            <ClockIcon className="h-3.5 w-3.5" /> {totalTime}m{times.length ? ` · ${times.join(' · ')}` : ''}
          </span>
        ) : null}
        {baseServings != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm">
            <UsersIcon className="h-3.5 w-3.5" /> serves {recipe.servings}
          </span>
        )}
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-paprika-700 shadow-sm">
            {recipe.source_author || 'source'} ↗
          </a>
        )}
      </div>

      {recipe.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <span key={t} className="rounded-full bg-paprika-50 px-3 py-1 text-xs font-medium text-paprika-800">
              {t}
            </span>
          ))}
        </div>
      )}

      {steps.length > 0 && (
        <button
          onClick={() => startCooking(0)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-paprika-700 py-4 text-base font-semibold text-white shadow-card transition hover:bg-paprika-800 active:scale-[0.98]"
        >
          <FlameIcon className="h-5 w-5" /> Start cooking
        </button>
      )}

      {ingredients.length > 0 && (
        <button
          onClick={() => grocery === 'idle' && setGrocerySheet(true)}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold transition active:scale-[0.98] ${
            grocery === 'added'
              ? 'border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
              : 'border-stone-200 bg-paper text-stone-700 hover:border-paprika-300 hover:text-paprika-700'
          }`}
        >
          {grocery === 'added' ? (
            <>
              <CheckIcon className="h-5 w-5" /> Added to grocery list
            </>
          ) : (
            <>
              <CartIcon className="h-5 w-5" /> Add to Grocery List
            </>
          )}
        </button>
      )}

      {ingredients.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Ingredients</h2>
            {baseServings != null && servings != null && (
              <div className="flex items-center gap-2">
                <button onClick={() => setServingsOverride(Math.max(1, (servings ?? 1) - 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition active:scale-90" aria-label="Fewer servings">
                  <MinusIcon className="h-4 w-4" />
                </button>
                <span className="min-w-[5rem] text-center text-sm font-medium text-stone-600">{servings} {servings === 1 ? 'serving' : 'servings'}</span>
                <button onClick={() => setServingsOverride(Math.min(50, (servings ?? 1) + 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition active:scale-90" aria-label="More servings">
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-4">
            {ingredientGroups.map((group, gi) => (
              <div key={group.section ?? gi}>
                {group.section && (
                  <h3 className="mb-1 px-2 font-display text-sm font-semibold uppercase tracking-wide text-paprika-700">
                    {group.section}
                  </h3>
                )}
                <ul className="space-y-0.5">
                  {group.items.map(({ index }) => {
                    const on = checked.has(index)
                    return (
                      <li key={index}>
                        <button onClick={() => toggleCheck(index)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition active:bg-stone-100">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'}`}>
                            {on && <CheckIcon className="h-3.5 w-3.5" />}
                          </span>
                          <span className={`text-sm ${on ? 'text-stone-400 line-through' : 'text-stone-700'}`}>{scaledIngredients[index]}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          {scale !== 1 && <p className="mt-2 px-2 text-xs text-stone-400">Quantities scaled from {recipe.servings}.</p>}
        </section>
      )}

      {steps.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Steps</h2>
            <span className="text-xs text-stone-400">Tap a step to cook</span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {steps.map((step, i) => (
              <li key={i}>
                <button onClick={() => startCooking(i)} className="flex w-full gap-3 rounded-xl px-2 py-2 text-left transition active:bg-stone-100">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paprika-700 text-xs font-semibold text-white">{i + 1}</span>
                  <span className="pt-0.5 text-sm text-stone-700">{step}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <div className="mt-8 rounded-2xl bg-paprika-50/60 p-5">
          <h3 className="font-display text-base font-semibold">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{recipe.notes}</p>
        </div>
      )}

      <div className="mt-10">
        <button onClick={remove} className="text-sm font-medium text-stone-400 transition hover:text-red-600">
          Delete recipe
        </button>
      </div>

      {grocerySheet && (
        <GrocerySheet ingredients={ingredients} onAdd={addToGrocery} onClose={() => setGrocerySheet(false)} />
      )}

      {cooking && (
        <CookMode
          title={recipe.title}
          steps={steps}
          ingredients={scaledIngredients}
          ingredientGroups={ingredientGroups}
          checked={checked}
          onToggle={toggleCheck}
          initialStep={cookStart}
          onClose={closeCooking}
        />
      )}
    </article>
  )
}
