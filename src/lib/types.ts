export type Ingredient = {
  raw: string // the original line, always present
  quantity?: string
  unit?: string
  item?: string
  section?: string // optional group label, e.g. "Dressing" / "Salad" (multi-part recipes)
}

export type SourcePlatform = 'instagram' | 'tiktok' | 'web' | 'pinterest' | 'manual'

export type Recipe = {
  id: string
  user_id: string
  title: string
  description: string | null
  source_platform: SourcePlatform | null
  source_url: string | null
  source_author: string | null
  image_url: string | null
  servings: string | null
  prep_minutes: number | null
  cook_minutes: number | null
  total_minutes: number | null
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  notes: string | null
  rating: number | null
  /** How many times this has actually been cooked — drives the "Most made"
   *  sort. Incremented on finishing Cook Mode or tapping "Made it". */
  times_made: number
  favorite: boolean
  status: 'draft' | 'saved'
  extraction_meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type GroceryItem = {
  id: string
  user_id: string
  text: string
  checked: boolean
  source_recipe_id: string | null
  created_at: string
}

export type RecipeJob = {
  id: string
  user_id: string
  url: string
  kind: 'link_in_bio' | 'video' | 'unknown'
  status: 'queued' | 'processing' | 'done' | 'failed'
  recipe_id: string | null
  error: string | null
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}
