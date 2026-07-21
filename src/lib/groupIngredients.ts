import type { Ingredient } from './types'

export type IngredientGroup = {
  section: string | null // null = ungrouped (single-part recipe, or items with no section)
  items: { ingredient: Ingredient; index: number }[] // index = position in the original array
}

// Group ingredients by their optional `section`, preserving each item's original
// array index (the check-off + scaling state is index-based, so groups must
// carry it). If no ingredient has a section, returns a single null-section group
// so callers can render a plain list exactly as before — fully backward-compatible.
export function groupIngredients(ingredients: Ingredient[]): IngredientGroup[] {
  const hasSections = ingredients.some((i) => i.section && i.section.trim())
  if (!hasSections) {
    return [{ section: null, items: ingredients.map((ingredient, index) => ({ ingredient, index })) }]
  }
  const groups: IngredientGroup[] = []
  const bySection = new Map<string, IngredientGroup>()
  ingredients.forEach((ingredient, index) => {
    const key = ingredient.section?.trim() || 'Other'
    let g = bySection.get(key)
    if (!g) {
      g = { section: key, items: [] }
      bySection.set(key, g)
      groups.push(g) // preserve first-seen section order
    }
    g.items.push({ ingredient, index })
  })
  return groups
}
