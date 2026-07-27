import type { Ingredient } from './types'

// The smarts behind Cook Mode: figuring out which ingredients a step mentions
// (so the step can show "you'll need" chips) and spotting durations in the text
// (so "simmer 25 minutes" becomes a tappable timer). Both are heuristics — a
// missed match costs a glance at the ingredient sheet, so they stay
// conservative and never throw.

// Words that carry no identity: articles, prep verbs, and modifiers that would
// cause false matches ("black" pepper vs "black" beans, "large" anything).
const STOP = new Set([
  'the', 'and', 'for', 'with', 'into', 'plus', 'more', 'taste', 'optional',
  'divided', 'needed', 'about', 'extra', 'very', 'finely', 'freshly', 'roughly',
  'thinly', 'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded',
  'melted', 'softened', 'beaten', 'peeled', 'crushed', 'packed', 'heaping',
  'large', 'small', 'medium', 'big', 'fresh', 'dried', 'frozen', 'canned',
  'cooked', 'uncooked', 'raw', 'ripe', 'black', 'white', 'red', 'green',
  'yellow', 'light', 'dark', 'hot', 'cold', 'warm', 'room', 'temperature',
  'plain', 'whole', 'half', 'quartered', 'halved', 'cut', 'trimmed', 'boneless',
  'skinless', 'unsalted', 'salted', 'low', 'sodium', 'reduced', 'fat', 'free',
  'cup', 'cups', 'tablespoon', 'tablespoons', 'tbsp', 'teaspoon', 'teaspoons',
  'tsp', 'ounce', 'ounces', 'pound', 'pounds', 'gram', 'grams', 'can', 'cans',
  'jar', 'package', 'bag', 'bunch', 'clove', 'cloves', 'stick', 'sticks',
  'pinch', 'dash', 'handful', 'piece', 'pieces', 'slice', 'slices',
])

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/[\s-]+/g, ' ')
    .trim()

// Crude plural stem — applied to BOTH sides, so consistency matters more than
// linguistic correctness ("tomatoes" and "tomato" both end up "tomato").
const stem = (t: string) => (t.length > 3 ? t.replace(/(?:es|s)$/, '') : t)

const words = (s: string) => norm(s).split(' ').filter(Boolean)

/**
 * Indexes of the ingredients this step's text mentions. Match rules, in order
 * of confidence: the ingredient's full (normalized) name appears as a phrase;
 * its head noun appears as a word; or two of its identity words appear.
 * When ingredients share a head noun ("tomato paste" / "crushed tomatoes"),
 * a full-phrase match beats head-noun-only matches for that noun — so the
 * paste step doesn't also claim the canned tomatoes.
 */
export function ingredientsForStep(step: string, ingredients: Ingredient[]): number[] {
  const stepNorm = ` ${norm(step)} `
  const stepStems = new Set(words(step).map(stem))
  const matches: { index: number; kind: 'phrase' | 'head' | 'multi'; headStem: string | null }[] = []

  ingredients.forEach((ing, index) => {
    const name = norm(ing.item?.trim() || ing.raw)
    if (!name) return
    const identity = words(name).filter((w) => w.length >= 3 && !STOP.has(w))
    const headStem = identity.length ? stem(identity[identity.length - 1]) : null

    if (name.length >= 4 && stepNorm.includes(` ${name} `)) {
      matches.push({ index, kind: 'phrase', headStem })
      return
    }
    if (!identity.length || headStem == null) return
    if (stepStems.has(headStem)) {
      matches.push({ index, kind: 'head', headStem })
      return
    }
    if (identity.length >= 2) {
      const hits = identity.filter((w) => w.length >= 4 && stepStems.has(stem(w))).length
      if (hits >= 2) matches.push({ index, kind: 'multi', headStem })
    }
  })

  // Every stem inside a phrase-matched name ("tomato paste" → tomato, paste).
  // A head-only match on any of those stems is almost certainly the phrase
  // ingredient being re-recognized by a shared noun — drop it. Misses are
  // cheap (the full list is one tap away); wrong chips mislead.
  const phraseStems = new Set(
    matches
      .filter((m) => m.kind === 'phrase')
      .flatMap((m) => {
        const ing = ingredients[m.index]
        return words(norm(ing.item?.trim() || ing.raw)).map(stem)
      }),
  )
  return matches
    .filter((m) => m.kind !== 'head' || !phraseStems.has(m.headStem ?? ''))
    .map((m) => m.index)
}

export type TimerSuggestion = {
  seconds: number
  /** As written, e.g. "25 min" or "1–2 hr" (countdown uses the lower bound). */
  label: string
}

const UNIT_SECONDS: Record<string, number> = {
  hour: 3600, hr: 3600,
  minute: 60, min: 60,
  second: 1, sec: 1,
}
const UNIT_SHORT: Record<string, string> = { hour: 'hr', hr: 'hr', minute: 'min', min: 'min', second: 'sec', sec: 'sec' }

const TIME_RE =
  /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\bto\b)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi

/** Durations mentioned in a step, deduped, capped at 3, longest-first. */
export function timersForStep(step: string): TimerSuggestion[] {
  const found = new Map<number, TimerSuggestion>()
  for (const m of step.matchAll(TIME_RE)) {
    const unit = m[3].toLowerCase().replace(/s$/, '')
    const per = UNIT_SECONDS[unit]
    if (!per) continue
    const lo = parseFloat(m[1])
    const hi = m[2] ? parseFloat(m[2]) : null
    const seconds = Math.round(lo * per)
    // Not worth a timer: sub-15s flourishes and absurd 12-hour marinades.
    if (seconds < 15 || seconds > 12 * 3600) continue
    const short = UNIT_SHORT[unit]
    const label = hi != null ? `${m[1]}–${m[2]} ${short}` : `${m[1]} ${short}`
    if (!found.has(seconds)) found.set(seconds, { seconds, label })
    if (found.size >= 3) break
  }
  return [...found.values()].sort((a, b) => b.seconds - a.seconds)
}

/** 95 → "1:35"; 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Text size that keeps most steps un-scrolled: big for terse steps, compact
 *  for the caption-blob monsters some extractions produce. */
export function stepTextClass(text: string): string {
  const len = text.length
  if (len <= 160) return 'text-[1.75rem] leading-snug sm:text-3xl'
  if (len <= 320) return 'text-[1.375rem] leading-snug sm:text-2xl'
  if (len <= 560) return 'text-lg leading-relaxed sm:text-xl'
  return 'text-base leading-relaxed sm:text-lg'
}

// A short, warm two-note chime, synthesized on demand — no asset, no network.
// The AudioContext is created inside the user's "start timer" tap so iOS
// allows playback later when the timer fires.
let audio: AudioContext | null = null

export function primeChime() {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (Ctor && !audio) audio = new Ctor()
    void audio?.resume()
  } catch {
    audio = null
  }
}

export function playChime() {
  if (!audio) return
  try {
    const t0 = audio.currentTime
    for (const [freq, at] of [[880, 0], [1174.7, 0.18], [880, 0.42], [1174.7, 0.6]] as const) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.28)
      osc.connect(gain).connect(audio.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + 0.3)
    }
  } catch {
    /* silent timers are still timers */
  }
}
