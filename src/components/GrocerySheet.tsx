import { useMemo, useState } from 'react'
import type { Ingredient } from '../lib/types'
import { groupIngredients } from '../lib/groupIngredients'
import { groceryName } from '../lib/groceryName'
import { CheckIcon, CloseIcon, CartIcon } from './icons'

// Slide-up sheet to pick which ingredients go to the grocery list. Everything is
// pre-checked (the common case is "most of them"); the user unchecks what they
// already have. Items are added by their shop-friendly name (no quantities).
export default function GrocerySheet({
  ingredients,
  onAdd,
  onClose,
}: {
  ingredients: Ingredient[]
  onAdd: (names: string[]) => void
  onClose: () => void
}) {
  const groups = useMemo(() => groupIngredients(ingredients), [ingredients])
  // Track selection by original index; start with all selected.
  const [selected, setSelected] = useState<Set<number>>(() => new Set(ingredients.map((_, i) => i)))

  const allOn = selected.size === ingredients.length
  function toggle(i: number) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }
  function toggleAll() {
    setSelected(allOn ? new Set() : new Set(ingredients.map((_, i) => i)))
  }
  function add() {
    const names = ingredients.filter((_, i) => selected.has(i)).map(groceryName).filter(Boolean)
    onAdd(names)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[88%] flex-col rounded-b-3xl bg-paper pt-safe-t"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="font-display text-lg font-semibold">Add to grocery list</h3>
          <button onClick={onClose} className="rounded-full p-1 text-stone-400 transition hover:bg-stone-100" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-xs text-stone-400">Pick what you need — amounts aren’t added.</p>
          <button onClick={toggleAll} className="text-xs font-medium text-paprika-700 transition active:opacity-60">
            {allOn ? 'Clear all' : 'Select all'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {groups.map((group, gi) => (
            <div key={group.section ?? gi} className="mb-2">
              {group.section && (
                <h4 className="mb-1 px-2 pt-1 font-display text-xs font-semibold uppercase tracking-wide text-paprika-700">
                  {group.section}
                </h4>
              )}
              <ul>
                {group.items.map(({ ingredient, index }) => {
                  const on = selected.has(index)
                  return (
                    <li key={index}>
                      <button
                        onClick={() => toggle(index)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition active:bg-stone-100"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'
                          }`}
                        >
                          {on && <CheckIcon className="h-3.5 w-3.5" />}
                        </span>
                        <span className={`text-sm ${on ? 'text-stone-700' : 'text-stone-400'}`}>{groceryName(ingredient)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 pt-2">
          <button
            onClick={add}
            disabled={selected.size === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-paprika-700 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98] disabled:opacity-40"
          >
            <CartIcon className="h-5 w-5" />
            {selected.size === 0 ? 'Select items' : `Add ${selected.size} ${selected.size === 1 ? 'item' : 'items'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
