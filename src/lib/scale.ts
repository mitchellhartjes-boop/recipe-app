// Ingredient-quantity scaling for the servings stepper. Works off the ingredient
// `raw` line (always present) by parsing a LEADING quantity — handles whole
// numbers, decimals, ASCII fractions ("1/2", "1 1/2"), unicode fractions
// ("½", "1½"), and ranges ("2-3", "2 to 3"). Anything without a leading
// quantity (e.g. "Salt to taste") is returned unchanged.

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

export function formatQuantity(n: number): string {
  if (!isFinite(n) || n < 0) return ''
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
  if (err <= 0.04) {
    if (best[0] === 1) return String(whole + 1) // rounded up to next whole
    if (best[1] === '') return String(whole) // clean whole number
    return whole === 0 ? best[1] : `${whole} ${best[1]}` // pure or mixed fraction
  }
  return (Math.round(n * 10) / 10).toString() // not near a nice fraction → 1 decimal
}

export function scaleIngredient(raw: string, scale: number): string {
  if (!raw || scale === 1) return raw
  const p = parseLeadingQuantity(raw)
  if (!p) return raw
  const a = formatQuantity(p.v1 * scale)
  if (!a) return raw
  const b = p.v2 != null ? formatQuantity(p.v2 * scale) : null
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
