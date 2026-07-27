import { useEffect, useMemo, useRef, useState } from 'react'
import { CloseIcon, CheckIcon, ClockIcon, FlameIcon, ListIcon, ChevronLeftIcon } from './icons'
import type { IngredientGroup } from '../lib/groupIngredients'
import type { Recipe } from '../lib/types'
import { useWakeLock } from '../lib/useWakeLock'
import {
  ingredientsForStep,
  timersForStep,
  formatClock,
  stepTextClass,
  primeChime,
  playChime,
} from '../lib/cookSmart'
import SourceCredit from './SourceCredit'

type Props = {
  title: string
  recipe: Recipe
  steps: string[]
  ingredients: string[] // already scaled for display, indexed by original position
  ingredientGroups: IngredientGroup[] // grouping (by original index) for the sheet
  checked: Set<number>
  onToggle: (i: number) => void
  initialStep?: number
  onClose: (finished?: boolean) => void
}

type Timer = {
  id: number
  label: string
  stepNo: number
  totalSeconds: number
  endsAt: number
  done: boolean
}

// Full-screen cooking companion. One step at a time with adaptive type, the
// step's OWN ingredients as check-off chips, durations in the text offered as
// one-tap timers (which keep running across steps), a segmented tap-to-jump
// progress bar, swipe navigation, and a wake lock so the phone stays lit on
// the counter.
export default function CookMode({
  title,
  recipe,
  steps,
  ingredients,
  ingredientGroups,
  checked,
  onToggle,
  initialStep = 0,
  onClose,
}: Props) {
  const [i, setI] = useState(Math.min(initialStep, Math.max(0, steps.length - 1)))
  const [sheet, setSheet] = useState(false)
  const [timers, setTimers] = useState<Timer[]>([])
  // Render-safe clock: updated by the tick interval (and when a timer starts),
  // never read via Date.now() during render.
  const [now, setNow] = useState(0)
  const timerId = useRef(0)
  const stepPane = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  useWakeLock()

  // Which ingredients / durations belong to each step — computed once per recipe.
  const stepIngredients = useMemo(
    () => steps.map((s) => ingredientsForStep(s, ingredientGroups.flatMap((g) => g.items.map((it) => it.ingredient)))),
    // ingredientGroups is rebuilt with the recipe, not per keystroke — safe key.
    [steps, ingredientGroups],
  )
  // Chip indexes must map to the ORIGINAL ingredient positions (check-state is
  // index-based), so flatten the groups in the same order used above.
  const flatIndexes = useMemo(() => ingredientGroups.flatMap((g) => g.items.map((it) => it.index)), [ingredientGroups])
  const stepTimers = useMemo(() => steps.map((s) => timersForStep(s)), [steps])

  // Tick twice a second while any timer runs; fire the chime exactly once each.
  useEffect(() => {
    if (!timers.length) return
    const tick = () => {
      setNow(Date.now())
      setTimers((prev) => {
        let changed = false
        const next = prev.map((t) => {
          if (!t.done && t.endsAt <= Date.now()) {
            changed = true
            playChime()
            return { ...t, done: true }
          }
          return t
        })
        return changed ? next : prev
      })
    }
    tick()
    const int = setInterval(tick, 500)
    return () => clearInterval(int)
  }, [timers.length])

  // Desktop convenience: arrows + escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steps.length, onClose])

  // Fresh step starts at the top even if the previous one was scrolled.
  useEffect(() => {
    stepPane.current?.scrollTo({ top: 0 })
  }, [i])

  function startTimer(seconds: number, label: string) {
    primeChime()
    timerId.current += 1
    setTimers((prev) => [
      ...prev,
      { id: timerId.current, label, stepNo: i + 1, totalSeconds: seconds, endsAt: Date.now() + seconds * 1000, done: false },
    ])
  }
  const dismissTimer = (id: number) => setTimers((prev) => prev.filter((t) => t.id !== id))

  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 64 && Math.abs(dy) < 56) {
      if (dx < 0) setI((x) => Math.min(steps.length - 1, x + 1))
      else setI((x) => Math.max(0, x - 1))
    }
  }

  const last = i === steps.length - 1
  const step = steps[i] ?? ''
  const needs = stepIngredients[i] ?? []
  const suggestions = stepTimers[i] ?? []
  const checkedCount = checked.size
  const runningForSuggestion = (seconds: number) =>
    timers.find((t) => t.stepNo === i + 1 && t.totalSeconds === seconds && !t.done)

  return (
    // h-screen is the fallback; 100dvh (where supported) tracks iOS Safari's
    // collapsing toolbars so the controls sit at the VISIBLE bottom edge —
    // with plain inset-0 they render below the fold until the chrome hides.
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-screen flex-col bg-cream pt-safe-t pb-safe-b"
      style={{ height: '100dvh' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => onClose()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition active:bg-stone-200"
          aria-label="Exit cook mode"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold">{title}</p>
          <div className="flex items-center gap-1.5">
            <p className="shrink-0 text-xs text-stone-400">
              Step {i + 1} of {steps.length}
            </p>
            <SourceCredit recipe={recipe} compact />
          </div>
        </div>
      </div>

      {/* ── Progress: one segment per step, tap to jump ────────── */}
      {steps.length <= 24 ? (
        <div className="flex gap-1 px-4">
          {steps.map((_, s) => (
            <button
              key={s}
              onClick={() => setI(s)}
              aria-label={`Go to step ${s + 1}`}
              className="group flex-1 py-1.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${
                  s <= i ? 'bg-paprika-600' : 'bg-stone-200 group-active:bg-stone-300'
                }`}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="mx-4 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-paprika-600 transition-all duration-300"
            style={{ width: `${((i + 1) / steps.length) * 100}%` }}
          />
        </div>
      )}

      {/* ── Live timers rail (persists across steps) ───────────── */}
      {timers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {timers.map((t) => {
            // Clamped so the first render (before the tick effect seeds `now`)
            // shows the full duration instead of nonsense.
            const remaining = Math.min((t.endsAt - now) / 1000, t.totalSeconds)
            return t.done ? (
              <button
                key={t.id}
                onClick={() => dismissTimer(t.id)}
                className="animate-timer-done flex shrink-0 items-center gap-1.5 rounded-full bg-paprika-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm"
              >
                <ClockIcon className="h-3.5 w-3.5" />
                {t.label} done — tap to clear
              </button>
            ) : (
              <span
                key={t.id}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-paper py-2 pl-3.5 pr-1.5 text-xs font-semibold text-ink shadow-sm"
              >
                <ClockIcon className="h-3.5 w-3.5 text-paprika-700" />
                <span className="tabular-nums">{formatClock(remaining)}</span>
                <span className="font-normal text-stone-400">· step {t.stepNo}</span>
                <button
                  onClick={() => dismissTimer(t.id)}
                  aria-label={`Cancel the ${t.label} timer`}
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition active:bg-stone-200"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* ── The step ───────────────────────────────────────────── */}
      {/* min-h-0 is what makes this pane actually SCROLL instead of growing:
          without it a long step inflates the flex column and pushes the
          Back/Next bar off-screen. */}
      <div
        ref={stepPane}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-6"
      >
        <div key={i} className="animate-step-in mx-auto max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-paprika-700">Step {i + 1}</p>
          <p className={`mt-2 font-medium text-ink ${stepTextClass(step)}`}>{step}</p>

          {suggestions.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {suggestions.map((sug) => {
                const running = runningForSuggestion(sug.seconds)
                return running ? (
                  <span
                    key={sug.seconds}
                    className="flex items-center gap-1.5 rounded-full border border-paprika-200 bg-paprika-50 px-3.5 py-2 text-sm font-semibold tabular-nums text-paprika-800"
                  >
                    <ClockIcon className="h-4 w-4" />
                    {formatClock(Math.min((running.endsAt - now) / 1000, running.totalSeconds))}
                  </span>
                ) : (
                  <button
                    key={sug.seconds}
                    onClick={() => startTimer(sug.seconds, sug.label)}
                    className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-paper px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-paprika-300 hover:text-paprika-700 active:scale-95"
                  >
                    <ClockIcon className="h-4 w-4" />
                    {sug.label} timer
                  </button>
                )
              })}
            </div>
          )}

          {needs.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">You’ll need</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {needs.map((flatIdx) => {
                  const index = flatIndexes[flatIdx]
                  const on = checked.has(index)
                  return (
                    <button
                      key={index}
                      onClick={() => onToggle(index)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition active:scale-95 ${
                        on
                          ? 'bg-paprika-700/10 text-stone-400 line-through'
                          : 'bg-paper text-stone-700 shadow-sm'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                          on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'
                        }`}
                      >
                        {on && <CheckIcon className="h-2.5 w-2.5" />}
                      </span>
                      {ingredients[index]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Ingredients sheet ──────────────────────────────────── */}
      {sheet && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/40" onClick={() => setSheet(false)}>
          <div
            className="mt-auto max-h-[72%] overflow-y-auto overscroll-contain rounded-t-3xl bg-paper px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                Ingredients
                <span className="ml-2 text-sm font-normal text-stone-400">
                  {checkedCount}/{ingredients.length}
                </span>
              </h3>
              <button onClick={() => setSheet(false)} className="text-stone-400" aria-label="Close">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {ingredientGroups.map((group, gi) => (
                <div key={group.section ?? gi}>
                  {group.section && (
                    <h4 className="mb-1 px-2 font-display text-xs font-semibold uppercase tracking-wide text-paprika-700">
                      {group.section}
                    </h4>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map(({ index }) => {
                      const on = checked.has(index)
                      return (
                        <li key={index}>
                          <button
                            onClick={() => onToggle(index)}
                            className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition active:bg-stone-100"
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'
                              }`}
                            >
                              {on && <CheckIcon className="h-3.5 w-3.5" />}
                            </span>
                            <span className={`text-sm ${on ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                              {ingredients[index]}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        {ingredients.length > 0 && (
          <button
            onClick={() => setSheet(true)}
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-stone-100 px-4 text-sm font-medium text-stone-600 transition active:scale-95"
            aria-label="Show all ingredients"
          >
            <ListIcon className="h-[18px] w-[18px]" />
            <span className="tabular-nums">
              {checkedCount}/{ingredients.length}
            </span>
          </button>
        )}
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          disabled={i === 0}
          aria-label="Previous step"
          className="flex h-12 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 transition active:scale-95 disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        {last ? (
          <button
            onClick={() => onClose(true)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-paprika-700 text-sm font-semibold text-white shadow-card transition active:scale-95"
          >
            <FlameIcon className="h-5 w-5" /> Finish cooking
          </button>
        ) : (
          <button
            onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-paprika-700 text-sm font-semibold text-white shadow-card transition active:scale-95"
          >
            Next step
          </button>
        )}
      </div>
    </div>
  )
}
