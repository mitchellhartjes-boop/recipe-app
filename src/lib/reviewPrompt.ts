import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'

// When to ask for an App Store review. Spec: docs/marketing-specs/review-prompt.md
//
// The whole point is to ask at a moment of success and never at a moment of
// frustration. Everything here is LOCAL — counters in localStorage, no server
// calls, no analytics events — which keeps it consistent with the no-tracking
// promise and means a rating prompt can never depend on the network.

type DillaReview = { requestReview(): Promise<{ requested: boolean }> }
const DillaReview = registerPlugin<DillaReview>('DillaReview')

// Bump on a release that should be allowed to ask again. Apple independently
// caps this at ~3 prompts per year and silently no-ops beyond that, so this is
// our own politeness limit, not a way around theirs.
const PROMPT_VERSION = '2.0'

const K = {
  firstLaunch: 'dilla.review.firstLaunch',
  cooks: 'dilla.review.cooks',
  promptedVersion: 'dilla.review.promptedVersion',
}

const DAYS_BEFORE_ASKING = 3
const COOKS_BEFORE_ASKING = 2
const LIBRARY_BEFORE_ASKING = 10

// Session-scoped, deliberately in memory: a failed import or a paywall wall
// poisons THIS run of the app, and a fresh launch is a fresh mood.
let frustratedThisSession = false

/** Call when the user hits something annoying — a failed import, the paywall.
 *  Suppresses any review prompt for the rest of this app session. */
export function noteFrustration() {
  frustratedThisSession = true
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode — we simply never reach the thresholds, which is safe */
  }
}

/** Start the "installed at" clock. Called once on app boot. */
export function initReviewClock() {
  if (!Capacitor.isNativePlatform()) return
  if (!read(K.firstLaunch)) write(K.firstLaunch, String(Date.now()))
}

/** Count a finished Cook Mode session (reached the last step). */
export function noteCookCompleted() {
  if (!Capacitor.isNativePlatform()) return
  write(K.cooks, String(Number(read(K.cooks) ?? '0') + 1))
}

/** The cheap, local half of the decision — no DB, no plugin call. */
function eligible(): boolean {
  if (!Capacitor.isNativePlatform()) return false
  if (frustratedThisSession) return false
  if (read(K.promptedVersion) === PROMPT_VERSION) return false
  const first = Number(read(K.firstLaunch) ?? '0')
  if (!first) return false
  const days = (Date.now() - first) / 86_400_000
  return days >= DAYS_BEFORE_ASKING
}

async function ask() {
  // Record BEFORE asking: if the call throws or Apple throttles it, we still
  // don't pester on the next cook. One ask per version, attempted or not.
  write(K.promptedVersion, PROMPT_VERSION)
  try {
    await DillaReview.requestReview()
  } catch {
    /* plugin missing or no active scene — nothing to fall back to, by design */
  }
}

/**
 * Trigger A — the good one. Called after a Cook Mode session is finished, on
 * the completion moment, after a short beat so it lands on the glow rather
 * than interrupting the last step.
 */
export async function maybeAskAfterCook() {
  if (!eligible()) return
  if (Number(read(K.cooks) ?? '0') < COOKS_BEFORE_ASKING) return
  await new Promise((r) => setTimeout(r, 2000))
  if (frustratedThisSession) return // something went wrong during the beat
  await ask()
}

/**
 * Trigger B — the fallback, for people who import plenty but never open Cook
 * Mode. Fires when they open a recipe and their library has grown past the
 * threshold. The library count stands in for "successful imports" because
 * most imports arrive via the share extension, which never runs this code.
 *
 * The local guards run FIRST so the count query is rare rather than per-open.
 */
export async function maybeAskOnRecipeOpen() {
  if (!eligible()) return
  if (Number(read(K.cooks) ?? '0') >= COOKS_BEFORE_ASKING) return // trigger A owns it
  const { count } = await supabase
    .from('recipe_recipes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'saved')
  if ((count ?? 0) < LIBRARY_BEFORE_ASKING) return
  if (frustratedThisSession) return
  await ask()
}
