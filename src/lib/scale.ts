// Ingredient-quantity scaling for the servings stepper. Works off the ingredient
// `raw` line (always present) by parsing a LEADING quantity — handles whole
// numbers, decimals, ASCII fractions ("1/2", "1 1/2"), unicode fractions
// ("½", "1½"), and ranges ("2-3", "2 to 3"). Anything without a leading
// quantity (e.g. "Salt to taste") is returned unchanged.
//
// Scaling is UNIT-AWARE, because the same number wants a different shape
// depending on what it measures: cups and spoons want cooking fractions, grams
// want round numbers, and a kilo of flour should not be written "1050 g".

const UNI: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
}
const UNI_CLASS = '¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚'

function tokenToNumber(tok: string): number | null {
  let t = tok.trim()
  if (!t) return null
  let total = 0
  let matched = false
  const uni = t.match(new RegExp(`[${UNI_CLASS}]`))
  if (uni) {
    total += UNI[uni[0]]
    matched = true
    t = t.replace(uni[0], ' ').trim()
  }
  if (t) {
    let m: RegExpMatchArray | null
    if ((m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/))) {
      total += +m[1] + +m[2] / +m[3]
      matched = true
    } else if ((m = t.match(/^(\d+)\/(\d+)$/))) {
      total += +m[1] / +m[2]
      matched = true
    } else if (/^\d*\.?\d+$/.test(t)) {
      total += parseFloat(t)
      matched = true
    } else if (!matched) {
      return null
    }
  }
  return matched ? total : null
}

// Order matters: try mixed numbers ("1 1/2") and pure fractions ("1/2") BEFORE a
// plain integer, so "1/2" isn't greedily read as the whole number "1".
const SINGLE = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?(?:\\s*[${UNI_CLASS}])?|[${UNI_CLASS}])`
// Trailing `(\s*)` is captured as `sep` so we can faithfully rebuild "350g"
// (attached unit, no space) vs "2 cups" (space) after scaling.
const RANGE = new RegExp(`^\\s*(${SINGLE})(\\s*(?:-|–|—|to)\\s*(${SINGLE}))?(\\s*)`, 'i')

export type ParsedQty = { v1: number; v2: number | null; sep: string; rest: string }

export function parseLeadingQuantity(raw: string): ParsedQty | null {
  if (!raw) return null
  const m = raw.match(RANGE)
  if (!m) return null
  const v1 = tokenToNumber(m[1])
  if (v1 == null) return null
  const v2 = m[3] ? tokenToNumber(m[3]) : null
  return { v1, v2, sep: m[4] ?? '', rest: raw.slice(m[0].length) }
}

// Common cooking fractions to snap a scaled decimal back onto.
const SNAP: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'],
  [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
]

/**
 * A cook-readable quantity. Deliberately NEVER returns a bare decimal like
 * "1.2" — nobody measures 1.2 cups, and a doubled recipe full of them was the
 * single worst thing about the old scaler. Everything under 10 lands on a
 * kitchen fraction; larger amounts round to a half, then to a whole.
 */
export function formatQuantity(n: number): string {
  if (!isFinite(n) || n < 0) return ''
  if (n >= 20) return String(Math.round(n))
  if (n >= 10) {
    const half = Math.round(n * 2) / 2
    return Number.isInteger(half) ? String(half) : `${Math.floor(half)} ½`
  }
  const whole = Math.floor(n + 1e-9)
  const frac = n - whole
  let best = SNAP[0]
  let err = Infinity
  for (const c of SNAP) {
    const e = Math.abs(frac - c[0])
    if (e < err) {
      err = e
      best = c
    }
  }
  if (best[0] === 1) return String(whole + 1) // rounded up to the next whole
  if (best[1] === '') return String(whole) // clean whole number
  return whole === 0 ? best[1] : `${whole} ${best[1]}` // pure or mixed fraction
}

type MetricKind = 'g' | 'kg' | 'ml' | 'l' | 'other'

/** The unit token immediately after the quantity, if it is a metric one. */
function unitInfo(rest: string): { kind: MetricKind; token: string } {
  const m = rest.match(/^([a-zA-Z]+)\.?/)
  if (!m) return { kind: 'other', token: '' }
  const u = m[1].toLowerCase()
  if (['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'].includes(u)) return { kind: 'g', token: m[0] }
  if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(u)) return { kind: 'kg', token: m[0] }
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(u)) return { kind: 'ml', token: m[0] }
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(u)) return { kind: 'l', token: m[0] }
  return { kind: 'other', token: m[0] }
}

const trimZeros = (s: string) => s.replace(/\.?0+$/, '')

/**
 * Metric amounts as a cook would write them: no fractions, and precision that
 * drops as the number grows (nobody weighs 787 g of flour — they weigh 790).
 */
export function formatMetric(n: number, promoted: boolean): string {
  if (!isFinite(n) || n < 0) return ''
  if (promoted) return trimZeros(n.toFixed(2)) // e.g. 1.05 kg, 1.5 L, 2 kg
  if (n < 10) return trimZeros(n.toFixed(1))
  if (n < 100) return String(Math.round(n))
  if (n < 500) return String(Math.round(n / 5) * 5)
  return String(Math.round(n / 10) * 10)
}

export function scaleIngredient(raw: string, scale: number): string {
  if (!raw || scale === 1) return raw
  const p = parseLeadingQuantity(raw)
  if (!p) return raw

  const v1 = p.v1 * scale
  const v2 = p.v2 != null ? p.v2 * scale : null
  const unit = unitInfo(p.rest)

  if (unit.kind !== 'other') {
    // Promote g -> kg and ml -> L only when EVERY value in the range crosses
    // the line, so a "800-1200 g" range never becomes a lopsided "800 g-1.2 kg".
    const promote = (unit.kind === 'g' || unit.kind === 'ml') && v1 >= 1000 && (v2 ?? v1) >= 1000
    const div = promote ? 1000 : 1
    const a = formatMetric(v1 / div, promote)
    if (!a) return raw
    const b = v2 != null ? formatMetric(v2 / div, promote) : null
    const qty = b ? `${a}–${b}` : a
    const rest = promote ? p.rest.replace(unit.token, unit.kind === 'g' ? 'kg' : 'L') : p.rest
    return `${qty}${p.sep}${rest}`
  }

  const a = formatQuantity(v1)
  if (!a) return raw
  const b = v2 != null ? formatQuantity(v2) : null
  const qty = b ? `${a}–${b}` : a
  // `sep` is the exact original whitespace: '' for attached units ("350g"),
  // ' ' for spaced ("2 cups"). Use it verbatim — don't default '' to a space.
  return p.rest ? `${qty}${p.sep}${p.rest}` : qty
}

// Pull a base serving count out of strings like "4", "serves 4", "4-6 servings".
export function parseServings(s: string | null): number | null {
  if (!s) return null
  const m = s.match(/\d+(\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  return n > 0 && n <= 100 ? n : null
}
