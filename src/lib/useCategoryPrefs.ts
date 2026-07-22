import { useCallback, useEffect, useState } from 'react'
import { CATEGORIES, type Category } from './categories'

const KEY = 'dilla-category-prefs'

// The categories a brand-new user sees. Deliberately a short, high-signal set —
// a wall of twelve tiles on first launch reads as clutter, and the rest are one
// tap away in Edit. ("all" is the hero tile and is always shown.)
const DEFAULT_VISIBLE = ['chicken', 'steak', 'pastas', 'seafood', 'breakfast']

export type CustomCategory = {
  slug: string
  label: string
  emoji: string
  keywords: string[]
  custom: true
}

type Prefs = {
  visible: string[] // slugs, in display order
  custom: CustomCategory[]
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { visible: DEFAULT_VISIBLE, custom: [] }
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      visible: Array.isArray(p.visible) ? p.visible : DEFAULT_VISIBLE,
      custom: Array.isArray(p.custom) ? p.custom : [],
    }
  } catch {
    return { visible: DEFAULT_VISIBLE, custom: [] }
  }
}

function save(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage blocked (private mode) — prefs just won't persist this session */
  }
}

// Turn a user-typed name into a category that the existing keyword matcher can
// use. The label itself becomes the keyword, which is what a user intuitively
// expects: a "Tacos" category matches recipes with "taco" in the title or tags.
export function makeCustomCategory(label: string, emoji: string): CustomCategory {
  const clean = label.trim()
  const slug =
    'custom-' +
    clean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  // Singularize a trailing "s" so "Tacos" also matches "taco" (the matcher
  // already handles the plural direction on its own).
  const singular = clean.toLowerCase().replace(/s$/, '')
  const keywords = Array.from(new Set([clean.toLowerCase(), singular].filter(Boolean)))
  return { slug, label: clean, emoji: emoji || '🍽️', keywords, custom: true }
}

export function useCategoryPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    save(prefs)
  }, [prefs])

  // Every category the user could show: the built-ins plus their own.
  const all: Category[] = [...CATEGORIES, ...prefs.custom]

  // Only the visible ones, in the user's chosen order.
  const visible: Category[] = prefs.visible
    .map((slug) => all.find((c) => c.slug === slug))
    .filter((c): c is Category => Boolean(c))

  const toggle = useCallback((slug: string) => {
    setPrefs((p) => ({
      ...p,
      visible: p.visible.includes(slug) ? p.visible.filter((s) => s !== slug) : [...p.visible, slug],
    }))
  }, [])

  const addCustom = useCallback((label: string, emoji: string) => {
    const cat = makeCustomCategory(label, emoji)
    if (!cat.label) return null
    setPrefs((p) => {
      // Don't duplicate an existing slug; just make sure it's visible.
      if (p.custom.some((c) => c.slug === cat.slug) || CATEGORIES.some((c) => c.slug === cat.slug)) {
        return { ...p, visible: p.visible.includes(cat.slug) ? p.visible : [...p.visible, cat.slug] }
      }
      return { custom: [...p.custom, cat], visible: [...p.visible, cat.slug] }
    })
    return cat
  }, [])

  const removeCustom = useCallback((slug: string) => {
    setPrefs((p) => ({
      custom: p.custom.filter((c) => c.slug !== slug),
      visible: p.visible.filter((s) => s !== slug),
    }))
  }, [])

  const reset = useCallback(() => setPrefs({ visible: DEFAULT_VISIBLE, custom: [] }), [])

  return { visible, all, customCategories: prefs.custom, isVisible: (s: string) => prefs.visible.includes(s), toggle, addCustom, removeCustom, reset }
}
