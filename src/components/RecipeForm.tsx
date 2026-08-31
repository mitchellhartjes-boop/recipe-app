import { useState, type ReactNode } from 'react'
import {
  cleanValues,
  type CleanedRecipe,
  type FormIngredient,
  type RecipeFormValues,
} from '../lib/recipeForm'
import { CATEGORIES } from '../lib/categories'

// The one recipe-editing surface, shared by all three ways a recipe gets
// written: reviewing a fresh extraction, editing a saved recipe, and typing one
// in from scratch. Each caller owns its own save (insert vs update vs
// insert-with-follow-up-jobs); this component owns the fields and the
// normalisation, so the three can never drift apart.

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40'

export default function RecipeForm({
  heading,
  subtitle,
  banner,
  imageUrl,
  initial,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: {
  heading: string
  subtitle?: ReactNode
  banner?: string | null
  imageUrl?: string | null
  initial: RecipeFormValues
  submitLabel: string
  submittingLabel: string
  onSubmit: (clean: CleanedRecipe) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<RecipeFormValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof RecipeFormValues>(k: K, value: RecipeFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSubmit(cleanValues(v))
      // Deliberately leave `saving` true on success: the caller navigates away,
      // and re-enabling the button first invites a double-save.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recipe.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{heading}</h1>
      {subtitle}
      {banner && <p className="mt-4 rounded-xl bg-paprika-50 px-4 py-3 text-sm text-paprika-800">{banner}</p>}

      <div className="mt-6 space-y-5 rounded-2xl bg-paper p-6 shadow-card">
        {imageUrl && <img src={imageUrl} alt="" className="h-44 w-full rounded-xl object-cover" />}

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
          <input value={v.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Description</label>
          <textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={2} className={inputClass} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Servings</label>
            <input value={v.servings} onChange={(e) => set('servings', e.target.value)} className={inputClass} placeholder="4" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Prep (min)</label>
            <input value={v.prep} onChange={(e) => set('prep', e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Cook (min)</label>
            <input value={v.cook} onChange={(e) => set('cook', e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
        </div>

        <IngredientList items={v.ingredients} setItems={(next) => set('ingredients', next)} />
        <StepList items={v.steps} setItems={(next) => set('steps', next)} />

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Categories</label>
          <p className="mb-2 text-xs text-stone-400">
            Where this shows up on your home screen. Tap to add or remove.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = v.categories.includes(c.slug)
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      'categories',
                      on ? v.categories.filter((x) => x !== c.slug) : [...v.categories, c.slug],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm transition active:scale-[0.97] ${
                    on
                      ? 'border-paprika-600 bg-paprika-600 text-white shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:bg-stone-100'
                  }`}
                >
                  <span aria-hidden="true">{c.emoji}</span> {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Tags (comma-separated)</label>
          <input value={v.tags} onChange={(e) => set('tags', e.target.value)} className={inputClass} placeholder="dinner, pasta" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Your notes</label>
          <textarea
            value={v.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className={inputClass}
            placeholder="Tweaks, who liked it, etc."
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-xl bg-paprika-700 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
        >
          {saving ? submittingLabel : submitLabel}
        </button>
        <button onClick={onCancel} className="rounded-xl px-5 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100">
          Cancel
        </button>
      </div>
    </div>
  )
}

const rowClass =
  'flex-1 resize-y rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40'

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1.5 rounded-lg px-2 py-1 text-stone-400 transition hover:bg-stone-100 hover:text-red-600"
      aria-label="Remove"
    >
      ✕
    </button>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 text-sm font-medium text-paprika-700 hover:underline">
      + Add {label}
    </button>
  )
}

function IngredientList({ items, setItems }: { items: FormIngredient[]; setItems: (v: FormIngredient[]) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">Ingredients</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i}>
            {/* Group heading, so editing a multi-part recipe stays legible. */}
            {item.section && (i === 0 || items[i - 1].section !== item.section) && (
              <p className="mb-1 mt-2 px-1 font-display text-xs font-semibold uppercase tracking-wide text-paprika-700">
                {item.section}
              </p>
            )}
            <div className="flex items-start gap-2">
              <textarea
                value={item.raw}
                onChange={(e) => setItems(items.map((it, idx) => (idx === i ? { ...it, raw: e.target.value } : it)))}
                rows={1}
                placeholder="2 cups flour"
                className={rowClass}
              />
              <RemoveButton onClick={() => setItems(items.filter((_, idx) => idx !== i))} />
            </div>
          </div>
        ))}
      </div>
      <AddButton label="ingredient" onClick={() => setItems([...items, { raw: '' }])} />
    </div>
  )
}

function StepList({ items, setItems }: { items: string[]; setItems: (v: string[]) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">Steps</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-xs text-stone-400">{i + 1}.</span>
            <textarea
              value={item}
              onChange={(e) => setItems(items.map((it, idx) => (idx === i ? e.target.value : it)))}
              rows={2}
              placeholder="Describe a step…"
              className={rowClass}
            />
            <RemoveButton onClick={() => setItems(items.filter((_, idx) => idx !== i))} />
          </div>
        ))}
      </div>
      <AddButton label="step" onClick={() => setItems([...items, ''])} />
    </div>
  )
}
