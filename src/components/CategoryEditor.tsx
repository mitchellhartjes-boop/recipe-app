import { useState, type FormEvent } from 'react'
import type { Category } from '../lib/categories'
import { CheckIcon, CloseIcon, PlusIcon } from './icons'

// Sheet for choosing which category tiles appear on the home screen, and for
// adding your own. Opens from the top (same as the grocery picker) so the list
// is under the thumb rather than at the bottom of a long page.
export default function CategoryEditor({
  all,
  isVisible,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  onClose,
}: {
  all: Category[]
  isVisible: (slug: string) => boolean
  onToggle: (slug: string) => void
  onAddCustom: (label: string, emoji: string) => void
  onRemoveCustom: (slug: string) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')

  function add(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    onAddCustom(label, emoji)
    setLabel('')
    setEmoji('')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[88%] flex-col rounded-b-3xl bg-paper pt-safe-t"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h3 className="font-display text-lg font-semibold">Categories</h3>
          <button onClick={onClose} className="rounded-full p-1 text-stone-400 transition hover:bg-stone-100" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="px-5 pb-3 text-xs text-stone-400">
          Choose what shows on your home screen. Recipes sort themselves in automatically.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <ul>
            {all.map((c) => {
              const on = isVisible(c.slug)
              const isCustom = 'custom' in c
              return (
                <li key={c.slug} className="flex items-center gap-1">
                  <button
                    onClick={() => onToggle(c.slug)}
                    className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition active:bg-stone-100"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                        on ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'
                      }`}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-lg leading-none">{c.emoji}</span>
                    <span className={`text-sm ${on ? 'text-stone-700' : 'text-stone-400'}`}>{c.label}</span>
                  </button>
                  {isCustom && (
                    <button
                      onClick={() => onRemoveCustom(c.slug)}
                      className="mr-2 shrink-0 rounded-lg p-1.5 text-stone-300 transition hover:bg-stone-100 hover:text-red-600"
                      aria-label={`Delete ${c.label}`}
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <form onSubmit={add} className="flex items-center gap-2 border-t border-stone-100 px-4 py-3 pb-4">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
            placeholder="🌮"
            aria-label="Emoji"
            className="w-14 shrink-0 rounded-xl border border-stone-200 bg-paper px-2 py-2.5 text-center text-base outline-none focus:border-paprika-400"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Add your own — e.g. Tacos"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-paprika-400"
          />
          <button
            type="submit"
            disabled={!label.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paprika-700 text-white transition active:scale-95 disabled:opacity-40"
            aria-label="Add category"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
