import type { Recipe } from './types'

export type SortKey = 'recent' | 'made' | 'rating' | 'alpha'

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'made', label: 'Most made' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'alpha', label: 'A–Z' },
]

// One remembered choice across the library and every category — picking a sort
// in "All" and finding "Chicken" back on the default would just feel broken.
const STORAGE_KEY = 'dilla-recipe-sort'

export function loadSort(): SortKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return SORTS.some((s) => s.key === saved) ? (saved as SortKey) : 'recent'
  } catch {
    return 'recent'
  }
}

export function saveSort(key: SortKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* private mode / storage disabled — the sort just won't persist */
  }
}

// created_at is an ISO string, so lexicographic compare is chronological.
const newestFirst = (a: Recipe, b: Recipe) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)

/**
 * Returns a sorted COPY — the caller passes the shared list straight from the
 * store, and sorting in place would mutate it.
 *
 * Every comparator falls back to newest-first so that the large groups of ties
 * this data naturally has (unrated recipes are all 0, never-cooked are all 0)
 * come out in a stable, meaningful order instead of an arbitrary one.
 */
export function sortRecipes(list: Recipe[], key: SortKey): Recipe[] {
  const out = [...list]
  switch (key) {
    case 'made':
      return out.sort((a, b) => (b.times_made ?? 0) - (a.times_made ?? 0) || newestFirst(a, b))
    case 'rating':
      return out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || newestFirst(a, b))
    case 'alpha':
      // localeCompare so accents sort naturally; base sensitivity so casing
      // doesn't split the list into two alphabets.
      return out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'recent':
    default:
      return out.sort(newestFirst)
  }
}
