import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from './icons'
import { SORTS, type SortKey } from '../lib/recipeSort'

// Compact sort control for the library + category lists. A pill that names the
// current sort (so the list order is never unexplained) opening a small menu.
export default function SortMenu({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const active = SORTS.find((s) => s.key === value) ?? SORTS[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm transition active:scale-95"
      >
        {active.label}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-200 bg-paper py-1 shadow-card"
        >
          {SORTS.map((s) => {
            const on = s.key === value
            return (
              <button
                key={s.key}
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(s.key)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition hover:bg-stone-100 ${
                  on ? 'font-semibold text-paprika-800' : 'text-stone-600'
                }`}
              >
                {s.label}
                {on && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
