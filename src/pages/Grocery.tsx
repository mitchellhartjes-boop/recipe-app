import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useGrocery } from '../lib/useGrocery'
import { useMealPlan } from '../lib/useMealPlan'
import { CheckIcon, PlusIcon, CloseIcon } from '../components/icons'
import type { GroceryItem } from '../lib/types'

export default function Grocery() {
  const { items, loading, addItem, remove, clearAll } = useGrocery()
  const { meals, setMeal } = useMealPlan()
  const [text, setText] = useState('')
  // Items mid-removal: show the check + strike, then delete after a beat so it
  // feels deliberate (checking an item clears it off the list, per design).
  const [clearing, setClearing] = useState<Set<string>>(new Set())
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function check(item: GroceryItem) {
    if (clearing.has(item.id)) return
    setClearing((prev) => new Set(prev).add(item.id))
    const t = window.setTimeout(() => void remove(item.id), 320)
    timers.current.push(t)
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    await addItem(t)
  }

  function onClearAll() {
    if (items.length === 0) return
    if (confirm('Clear the entire grocery list?')) void clearAll()
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header: title (desktop only — mobile shows it in the top bar) + count +
          Clear all. The row renders on mobile too so Clear all is reachable. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="hidden font-display text-3xl font-semibold tracking-tight sm:block">Grocery list</h1>
          {items.length > 0 && <span className="text-sm text-stone-400">{items.length} {items.length === 1 ? 'item' : 'items'}</span>}
        </div>
        {items.length > 0 && (
          <button
            onClick={onClearAll}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-red-600"
          >
            Clear all
          </button>
        )}
      </div>

      {/* This Week's Meals — 5 free-text slots, autosaved + synced. */}
      <section className="mb-5 rounded-2xl bg-paper p-4 shadow-card">
        <h2 className="mb-3 font-display text-lg font-semibold">This Week’s Meals</h2>
        <div className="space-y-2">
          {meals.map((meal, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paprika-50 text-xs font-semibold text-paprika-700">
                {i + 1}
              </span>
              <input
                value={meal}
                onChange={(e) => setMeal(i, e.target.value)}
                placeholder={`Meal ${i + 1}`}
                className="flex-1 border-b border-stone-200 bg-transparent py-1.5 text-base text-ink outline-none transition placeholder:text-stone-300 focus:border-paprika-400"
              />
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={onAdd} className="mb-5 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an item…"
          className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-base text-ink shadow-card outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:focus:ring-paprika-900/40"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paprika-700 text-white shadow-sm transition hover:bg-paprika-800 active:scale-95 disabled:opacity-40"
          aria-label="Add item"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </form>

      {loading ? (
        <div className="py-20 text-center text-sm text-stone-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-3xl">🛒</div>
          <h2 className="font-display text-2xl font-semibold">Your list is empty</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
            Add items above, or open a recipe and tap <span className="font-medium text-stone-600">Add to Grocery List</span>.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-paper shadow-card">
          {items.map((item, i) => {
            const going = clearing.has(item.id)
            return (
              <li
                key={item.id}
                className={`group flex items-center transition-all duration-300 ${i > 0 ? 'border-t border-stone-100' : ''} ${
                  going ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-24 opacity-100'
                }`}
              >
                {/* Whole row checks the item off */}
                <button
                  onClick={() => check(item)}
                  className="flex flex-1 items-center gap-3 py-3 pl-4 text-left transition active:bg-stone-100"
                  aria-label={`Check off ${item.text}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      going ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300 group-hover:border-paprika-500'
                    }`}
                  >
                    {going && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`text-sm ${going ? 'text-stone-400 line-through' : 'text-stone-700'}`}>{item.text}</span>
                </button>
                <button
                  onClick={() => void remove(item.id)}
                  className="mr-2 shrink-0 rounded-lg p-1.5 text-stone-300 transition hover:bg-stone-100 hover:text-stone-600"
                  aria-label={`Remove ${item.text}`}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
