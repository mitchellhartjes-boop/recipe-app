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

// Known cuisines and food groups get their dish vocabulary, so a category named
// "Italian" finds carbonara and lasagna — not just recipes containing the
// literal word "italian". Anything not listed still works; it just matches on
// its own name (a "Tacos" category finds taco recipes), which is what a user
// intuitively expects.
const LEXICON: Record<string, string[]> = {
  italian: ['italian', 'pasta', 'spaghetti', 'lasagna', 'lasagne', 'carbonara', 'bolognese', 'risotto', 'gnocchi', 'pesto', 'parmesan', 'parmigiana', 'marinara', 'bruschetta', 'focaccia', 'caprese', 'cacio e pepe', 'ravioli', 'tiramisu', 'piccata', 'alfredo', 'calzone', 'pizza'],
  greek: ['greek', 'gyro', 'souvlaki', 'tzatziki', 'feta', 'moussaka', 'spanakopita', 'baklava', 'halloumi', 'orzo'],
  french: ['french', 'ratatouille', 'coq au vin', 'quiche', 'crepe', 'baguette', 'bourguignon', 'croissant', 'gratin', 'souffle', 'beurre blanc'],
  indian: ['indian', 'curry', 'tikka', 'masala', 'naan', 'biryani', 'tandoori', 'dal', 'paneer', 'samosa', 'korma', 'vindaloo', 'chutney', 'raita'],
  thai: ['thai', 'pad thai', 'tom yum', 'satay', 'larb', 'massaman', 'lemongrass'],
  chinese: ['chinese', 'stir fry', 'stir-fry', 'fried rice', 'lo mein', 'chow mein', 'dumpling', 'wonton', 'bao', 'szechuan', 'kung pao', 'hoisin', 'dim sum'],
  japanese: ['japanese', 'sushi', 'ramen', 'teriyaki', 'tempura', 'miso', 'udon', 'soba', 'katsu', 'donburi', 'yakitori', 'edamame'],
  korean: ['korean', 'kimchi', 'bibimbap', 'bulgogi', 'gochujang', 'japchae', 'tteokbokki'],
  mediterranean: ['mediterranean', 'hummus', 'falafel', 'tahini', 'shawarma', 'tabbouleh', 'pita', 'couscous'],
  bbq: ['bbq', 'barbecue', 'barbeque', 'brisket', 'smoked', 'ribs', 'pulled pork', 'grilled', 'smoker'],
  dessert: ['dessert', 'cake', 'cookie', 'brownie', 'pie', 'ice cream', 'cheesecake', 'pudding', 'tart', 'frosting', 'cupcake'],
  vegetarian: ['vegetarian', 'veggie', 'meatless', 'tofu', 'tempeh', 'plant based', 'plant-based'],
  vegan: ['vegan', 'plant based', 'plant-based', 'tofu', 'tempeh'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'chorizo', 'pancetta', 'pork belly', 'carnitas'],
  snacks: ['snack', 'dip', 'appetizer', 'finger food', 'chips', 'popcorn'],
  sides: ['side', 'side dish', 'mashed potatoes', 'roasted vegetables', 'coleslaw', 'stuffing'],
}

// Turn a user-typed name into a category the keyword matcher can use.
export function makeCustomCategory(label: string, emoji: string): CustomCategory {
  const clean = label.trim()
  const lower = clean.toLowerCase()
  const slug = 'custom-' + lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // Singularize a trailing "s" so "Tacos" also matches "taco" (the matcher
  // already handles the plural direction on its own).
  const singular = lower.replace(/s$/, '')
  const known = LEXICON[lower] ?? LEXICON[singular] ?? []
  const keywords = Array.from(new Set([lower, singular, ...known].filter(Boolean)))
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
