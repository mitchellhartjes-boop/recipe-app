import { formatMetric, formatQuantity, parseLeadingQuantity } from './scale'

// Unit switching (Pro): rewrite an ingredient line into metric or US units.
//
// Rules that keep this honest and useful:
//  1. A line is only rewritten when the unit is recognised AND it isn't already
//     in the target system. Anything else passes through untouched — a wrong
//     conversion in a recipe is worse than no conversion.
//  2. Teaspoons and tablespoons are LEFT ALONE going to metric. Metric recipes
//     use spoons too, and "1 tsp salt" beats "5.7 g salt" every time.
//  3. Volume <-> weight needs the INGREDIENT's density (a cup of flour is
//     120 g, a cup of honey 340 g). Unknown ingredient means we fall back to
//     millilitres, which is always correct, rather than guessing.
//  4. Liquids go to millilitres, not grams — nobody weighs milk.

export type UnitSystem = 'original' | 'metric' | 'us'

type UnitDef = {
  re: RegExp
  kind: 'volume' | 'mass'
  /** ml per unit (volume) or grams per unit (mass). */
  factor: number
  system: 'metric' | 'us'
}

// Order matters: "fl oz" before "oz", longer words before their abbreviations.
const UNITS: UnitDef[] = [
  { re: /^fl\.?\s*(?:oz|ounces?)\b\.?/i, kind: 'volume', factor: 29.5735, system: 'us' },
  { re: /^(?:cups?|c)\b\.?/i, kind: 'volume', factor: 236.588, system: 'us' },
  { re: /^(?:tablespoons?|tbsps?|tbs)\b\.?/i, kind: 'volume', factor: 14.7868, system: 'us' },
  { re: /^(?:teaspoons?|tsps?)\b\.?/i, kind: 'volume', factor: 4.9289, system: 'us' },
  { re: /^(?:pints?|pt)\b\.?/i, kind: 'volume', factor: 473.176, system: 'us' },
  { re: /^(?:quarts?|qt)\b\.?/i, kind: 'volume', factor: 946.353, system: 'us' },
  { re: /^(?:milliliters?|millilitres?|ml)\b\.?/i, kind: 'volume', factor: 1, system: 'metric' },
  { re: /^(?:liters?|litres?|l)\b\.?/i, kind: 'volume', factor: 1000, system: 'metric' },
  { re: /^(?:pounds?|lbs?)\b\.?/i, kind: 'mass', factor: 453.592, system: 'us' },
  { re: /^(?:ounces?|oz)\b\.?/i, kind: 'mass', factor: 28.3495, system: 'us' },
  { re: /^(?:kilograms?|kilos?|kg)\b\.?/i, kind: 'mass', factor: 1000, system: 'metric' },
  { re: /^(?:grams?|grammes?|gr?)\b\.?/i, kind: 'mass', factor: 1, system: 'metric' },
]

// Grams per US cup. `liquid` ingredients are reported in ml instead of grams
// when going metric. First match wins, so specific patterns come first.
const DENSITY: { re: RegExp; gPerCup: number; liquid?: boolean }[] = [
  { re: /\b(?:powdered|icing|confectioners?'?)\s+sugar\b/i, gPerCup: 120 },
  { re: /\bbrown sugar\b/i, gPerCup: 213 },
  { re: /\bsugar\b/i, gPerCup: 200 },
  { re: /\bcocoa(?:\s+powder)?\b/i, gPerCup: 85 },
  { re: /\b(?:cornstarch|cornflour)\b/i, gPerCup: 128 },
  { re: /\bflour\b/i, gPerCup: 120 },
  { re: /\bbutter\b/i, gPerCup: 227 },
  { re: /\boil\b/i, gPerCup: 218, liquid: true },
  { re: /\b(?:honey|maple syrup|molasses|golden syrup)\b/i, gPerCup: 340 },
  { re: /\b(?:yogurt|yoghurt|sour cream|creme fraiche)\b/i, gPerCup: 245 },
  { re: /\bcream\b/i, gPerCup: 238, liquid: true },
  { re: /\b(?:milk|buttermilk|water|stock|broth|juice|wine)\b/i, gPerCup: 240, liquid: true },
  { re: /\b(?:rolled oats|oatmeal|oats)\b/i, gPerCup: 90 },
  { re: /\brice\b/i, gPerCup: 185 },
  { re: /\bbreadcrumbs?\b/i, gPerCup: 108 },
  { re: /\bchocolate chips?\b/i, gPerCup: 170 },
  { re: /\b(?:parmesan|cheddar|mozzarella|cheese)\b/i, gPerCup: 100 },
  { re: /\b(?:nuts?|almonds|walnuts|pecans)\b/i, gPerCup: 125 },
  { re: /\bsalt\b/i, gPerCup: 273 },
]

function densityFor(text: string) {
  return DENSITY.find((d) => d.re.test(text)) ?? null
}

function detect(rest: string): { def: UnitDef; token: string } | null {
  for (const def of UNITS) {
    const m = rest.match(def.re)
    if (m) return { def, token: m[0] }
  }
  return null
}

/** Pick the US unit a cook would actually reach for at this size. */
function usVolume(ml: number): { qty: number; unit: string } {
  if (ml < 14.7868) return { qty: ml / 4.9289, unit: 'tsp' }
  if (ml < 59) return { qty: ml / 14.7868, unit: 'tbsp' }
  return { qty: ml / 236.588, unit: 'cup' }
}

type Rendered = { text: string; unit: string }

/**
 * Rewrite one ingredient line into `system`. Returns the line unchanged when
 * there is no leading quantity, no recognised unit, or it is already in the
 * target system.
 */
export function convertIngredient(raw: string, system: UnitSystem): string {
  if (!raw || system === 'original') return raw
  const p = parseLeadingQuantity(raw)
  if (!p) return raw
  const found = detect(p.rest)
  if (!found) return raw

  const target = system === 'metric' ? 'metric' : 'us'
  if (found.def.system === target) return raw

  // Spoons survive the trip to metric untouched (rule 2 above).
  if (target === 'metric' && found.def.kind === 'volume' && found.def.factor < 15) return raw

  const tail = p.rest.slice(found.token.length).replace(/^\s+/, '')
  const density = densityFor(tail)

  function render(v: number): Rendered | null {
    const base = v * found!.def.factor // ml for volume, g for mass

    if (target === 'metric') {
      if (found!.def.kind === 'volume' && density && !density.liquid) {
        const grams = (base / 236.588) * density.gPerCup
        const big = grams >= 1000
        return { text: formatMetric(big ? grams / 1000 : grams, big), unit: big ? 'kg' : 'g' }
      }
      // Liquids and unknown ingredients: millilitres, always correct.
      if (found!.def.kind === 'volume') {
        const big = base >= 1000
        return { text: formatMetric(big ? base / 1000 : base, big), unit: big ? 'L' : 'ml' }
      }
      const big = base >= 1000
      return { text: formatMetric(big ? base / 1000 : base, big), unit: big ? 'kg' : 'g' }
    }

    // -> US. A weight whose ingredient we know reads better as cups than as
    // ounces: an American recipe says "1 3/4 cups flour", not "8 7/8 oz".
    if (found!.def.kind === 'mass' && density) {
      const ml = (base / density.gPerCup) * 236.588
      const u = usVolume(ml)
      return { text: formatQuantity(u.qty), unit: u.unit }
    }
    if (found!.def.kind === 'mass') {
      return base >= 453.592
        ? { text: formatQuantity(base / 453.592), unit: 'lb' }
        : { text: formatQuantity(base / 28.3495), unit: 'oz' }
    }
    const u = usVolume(base)
    return { text: formatQuantity(u.qty), unit: u.unit }
  }

  const a = render(p.v1)
  if (!a || !a.text) return raw
  // A range must land in ONE unit: only join the bounds when the upper one
  // picked the same unit, otherwise show the lower bound alone.
  const b = p.v2 != null ? render(p.v2) : null
  const qty = b && b.text && b.unit === a.unit ? `${a.text}–${b.text}` : a.text
  const unit = a.unit === 'cup' && qty !== '1' ? 'cups' : a.unit
  return `${qty} ${unit}${tail ? ` ${tail}` : ''}`
}

/** Convenience for a whole ingredient list. */
export const convertAll = (lines: string[], system: UnitSystem): string[] =>
  lines.map((l) => convertIngredient(l, system))

const UNITS_KEY = 'dilla-units'

/** The cook's unit preference is about THEM, not one recipe — so it persists
 *  across recipes and sessions. Private mode just means it doesn't stick. */
export function readUnits(): UnitSystem {
  try {
    const v = localStorage.getItem(UNITS_KEY)
    return v === 'metric' || v === 'us' ? v : 'original'
  } catch {
    return 'original'
  }
}

export function writeUnits(v: UnitSystem) {
  try {
    localStorage.setItem(UNITS_KEY, v)
  } catch {
    /* private mode — the choice just won't stick */
  }
}
