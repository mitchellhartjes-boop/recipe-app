import type { Ingredient } from './types'

// Fallback cleaners for ingredients that lack a structured `item` (e.g. recipes
// added via the web review screen, which stores only `raw`).
const LEADING_QTY = /^[\d\s./¼½¾⅓⅔⅛⅜⅝⅞–-]+/
const LEADING_UNIT =
  /^(cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|grams?|g|kg|ml|l|cloves?|cans?|jars?|slices?|sticks?|pinch(?:es)?|dash(?:es)?|sprigs?|bunch(?:es)?|heads?|packages?|pkg|handful)\b\.?\s+/i

// The shopping-friendly name for an ingredient: just the thing to buy — no
// quantity, unit, or prep notes. "2 tbsp cinnamon" -> "Cinnamon";
// "3/4 cup parmigiano cheese, finely grated" -> "Parmigiano cheese".
export function groceryName(ing: Ingredient): string {
  // Prefer the structured item (already free of quantity/unit); else clean raw.
  let s = (ing.item || '').trim()
  if (!s) {
    s = (ing.raw || '')
      .trim()
      .replace(LEADING_QTY, '') // leading amount: "1 ", "3/4 ", "2-3 "
      .replace(/^\([^)]*\)\s*/, '') // size note in parens: "(14 oz) "
      .replace(LEADING_UNIT, '') // unit word: "cup ", "can ", "tbsp "
  }
  // Drop prep notes after the first comma ("kale, finely chopped" -> "kale").
  s = s.split(',')[0].trim()
  // Tidy capitalization for the list.
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
