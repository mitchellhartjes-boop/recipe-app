import { useEffect, useState } from 'react'
import { CloseIcon, CheckIcon } from './icons'
import type { IngredientGroup } from '../lib/groupIngredients'
import type { Recipe } from '../lib/types'
import { useWakeLock } from '../lib/useWakeLock'
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

// Full-screen, distraction-free cooking view: one big step at a time, a progress
// bar, an ingredients peek-sheet, and a screen wake-lock so the phone won't dim
// on the counter.
export default function CookMode({ title, recipe, steps, ingredients, ingredientGroups, checked, onToggle, initialStep = 0, onClose }: Props) {
  const [i, setI] = useState(Math.min(initialStep, Math.max(0, steps.length - 1)))
  const [sheet, setSheet] = useState(false)

  // Keep the screen awake while cooking. (The recipe page holds one too, so
  // cooking straight from there doesn't dim either.)
  useWakeLock()

  // Desktop convenience: arrow keys + escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steps.length, onClose])

  const last = i === steps.length - 1
  const pct = steps.length ? ((i + 1) / steps.length) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream pt-safe-t pb-safe-b">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onClose()} className="flex h-10 w-10 items-center justify-center rounded-full text-stone-500 transition active:bg-stone-200" aria-label="Exit cook mode">
          <CloseIcon className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold">{title}</p>
          <div className="flex items-center gap-1.5">
            <p className="shrink-0 text-xs text-stone-400">Step {i + 1} of {steps.length}</p>
            <SourceCredit recipe={recipe} compact />
          </div>
        </div>
      </div>

      <div className="mx-4 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-paprika-600 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-1 items-start overflow-y-auto px-6 py-8">
        <p className="mx-auto max-w-xl text-2xl font-medium leading-relaxed text-ink sm:text-[1.75rem] sm:leading-relaxed">
          {steps[i]}
        </p>
      </div>

      {sheet && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/40" onClick={() => setSheet(false)}>
          <div className="mt-auto max-h-[72%] overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Ingredients</h3>
              <button onClick={() => setSheet(false)} className="text-stone-400" aria-label="Close"><CloseIcon className="h-5 w-5" /></button>
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
                          <button onClick={() => onToggle(index)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition active:bg-stone-100">
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'}`}>
                              {on && <CheckIcon className="h-3.5 w-3.5" />}
                            </span>
                            <span className={`text-sm ${on ? 'text-stone-400 line-through' : 'text-stone-700'}`}>{ingredients[index]}</span>
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

      <div className="flex items-center gap-3 px-4 py-4">
        {ingredients.length > 0 && (
          <button onClick={() => setSheet(true)} className="flex h-12 shrink-0 items-center rounded-2xl bg-stone-100 px-4 text-sm font-medium text-stone-600 transition active:scale-95">
            Ingredients
          </button>
        )}
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          disabled={i === 0}
          className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-stone-100 text-sm font-semibold text-stone-700 transition active:scale-95 disabled:opacity-40"
        >
          Back
        </button>
        {last ? (
          <button onClick={() => onClose(true)} className="flex h-12 flex-[1.4] items-center justify-center rounded-2xl bg-paprika-700 text-sm font-semibold text-white transition active:scale-95">
            Finish
          </button>
        ) : (
          <button onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))} className="flex h-12 flex-[1.4] items-center justify-center rounded-2xl bg-paprika-700 text-sm font-semibold text-white transition active:scale-95">
            Next step
          </button>
        )}
      </div>
    </div>
  )
}
