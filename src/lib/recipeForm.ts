import type { Ingredient } from './types'

// Shapes + normalisation for the recipe editing form (src/components/RecipeForm).
// Kept out of the component file so all three save paths — review a fresh
// extraction, edit a saved recipe, write one by hand — normalise identically.

export type FormIngredient = { raw: string; section?: string | null }

export type RecipeFormValues = {
  title: string
  description: string
  servings: string
  prep: string
  cook: string
  ingredients: FormIngredient[]
  steps: string[]
  tags: string
  categories: string[]
  notes: string
}

export type CleanedRecipe = {
  title: string
  description: string | null
  servings: string | null
  prep_minutes: number | null
  cook_minutes: number | null
  ingredients: FormIngredient[]
  steps: string[]
  tags: string[]
  categories: string[]
  notes: string | null
}

function numOrNull(v: string): number | null {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** Form values -> the columns `recipe_recipes` expects. */
export function cleanValues(v: RecipeFormValues): CleanedRecipe {
  return {
    title: v.title.trim() || 'Untitled recipe',
    description: v.description.trim() || null,
    servings: v.servings.trim() || null,
    prep_minutes: numOrNull(v.prep),
    cook_minutes: numOrNull(v.cook),
    // The section travels WITH its row, so editing, adding, or deleting a line
    // can never scramble a multi-part recipe's Dressing/Salad grouping.
    ingredients: v.ingredients
      .map((i) => ({ ...i, raw: i.raw.trim() }))
      .filter((i) => i.raw)
      .map((i) => (i.section ? { raw: i.raw, section: i.section } : { raw: i.raw })),
    steps: v.steps.map((s) => s.trim()).filter(Boolean),
    tags: v.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    // Always written, never left null once the user has been through the form:
    // saving IS the moment they take ownership of the categorisation.
    categories: v.categories,
    notes: v.notes.trim() || null,
  }
}

export const emptyValues = (): RecipeFormValues => ({
  title: '',
  description: '',
  servings: '',
  prep: '',
  cook: '',
  ingredients: [{ raw: '' }],
  steps: [''],
  tags: '',
  categories: [],
  notes: '',
})

/** Prefill from a saved recipe (edit) or an extraction draft (review). */
export function valuesFrom(r: {
  title?: string | null
  description?: string | null
  servings?: string | null
  prep_minutes?: number | null
  cook_minutes?: number | null
  ingredients?: Ingredient[] | null
  steps?: string[] | null
  tags?: string[] | null
  categories?: string[] | null
  notes?: string | null
}, derived?: string[]): RecipeFormValues {
  const ings = (r.ingredients ?? []).map((i) => ({ raw: i.raw, section: i.section ?? null }))
  return {
    title: r.title ?? '',
    description: r.description ?? '',
    servings: r.servings ?? '',
    prep: r.prep_minutes?.toString() ?? '',
    cook: r.cook_minutes?.toString() ?? '',
    ingredients: ings.length ? ings : [{ raw: '' }],
    steps: r.steps?.length ? r.steps : [''],
    tags: (r.tags ?? []).join(', '),
    // Prefill with what the recipe already shows under. If the user never set
    // categories, that is the keyword matcher's answer — so opening a recipe
    // and saving it keeps the categories it already had instead of clearing them.
    categories: r.categories ?? derived ?? [],
    notes: r.notes ?? '',
  }
}
