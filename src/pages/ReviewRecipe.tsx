import { useMemo, useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { DraftRecipe } from '../lib/api'

type Banner = { kind: 'info'; text: string } | null

function numOrNull(v: string): number | null {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export default function ReviewRecipe() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { draft?: DraftRecipe; banner?: Banner } | null

  // Guard: if someone lands here without a draft (e.g. refresh), send them back.
  const initial = state?.draft
  const banner = state?.banner ?? null

  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [servings, setServings] = useState(initial?.servings ?? '')
  const [prep, setPrep] = useState(initial?.prep_minutes?.toString() ?? '')
  const [cook, setCook] = useState(initial?.cook_minutes?.toString() ?? '')
  const [ingredients, setIngredients] = useState<string[]>(
    initial?.ingredients?.map((i) => i.raw) ?? [''],
  )
  const [steps, setSteps] = useState<string[]>(initial?.steps?.length ? initial.steps : [''])
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceLabel = useMemo(() => {
    if (!initial?.source_url) return null
    try {
      return new URL(initial.source_url).hostname.replace(/^www\./, '')
    } catch {
      return initial.source_url
    }
  }, [initial])

  if (!initial) return <Navigate to="/add" replace />

  function updateList(list: string[], i: number, v: string) {
    const next = [...list]
    next[i] = v
    return next
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cleanIngredients = ingredients
        .map((raw) => raw.trim())
        .filter(Boolean)
        .map((raw) => ({ raw }))
      const cleanSteps = steps.map((s) => s.trim()).filter(Boolean)
      const cleanTags = tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)

      const { data, error: dbError } = await supabase
        .from('recipe_recipes')
        .insert({
          title: title.trim() || 'Untitled recipe',
          description: description.trim() || null,
          source_platform: initial!.source_platform,
          source_url: initial!.source_url,
          source_author: initial!.source_author,
          image_url: initial!.image_url,
          servings: servings.trim() || null,
          prep_minutes: numOrNull(prep),
          cook_minutes: numOrNull(cook),
          ingredients: cleanIngredients,
          steps: cleanSteps,
          tags: cleanTags,
          notes: notes.trim() || null,
          status: 'saved',
          extraction_meta: initial!.extraction_meta ?? {},
        })
        .select('id')
        .single()
      if (dbError) throw dbError

      const fromVideoPlatform =
        initial!.source_url && /instagram\.com|tiktok\.com/i.test(initial!.source_url)

      // Saved with ingredients but no steps (an ingredients-only caption) from a
      // video platform: queue a steps backfill — the worker watches the video
      // and completes the recipe in place. Unmetered (it finishes an import the
      // user already spent a slot on); the worker validates eligibility.
      // Best-effort, like the cover job below — never blocks the save.
      if (cleanSteps.length === 0 && fromVideoPlatform) {
        void supabase
          .from('recipe_jobs')
          .insert({ url: initial!.source_url, kind: 'video', meta: { recipe_id: data.id, backfill: 'steps' } })
      } else if (!initial!.image_url && initial!.source_url && /instagram\.com/i.test(initial!.source_url)) {
        // Instagram's caption embed doesn't expose a usable cover image, so a
        // reel saved through this screen has no photo. The worker pulls the
        // reel's clean cover via Apify and fills it in within a minute or two.
        // (The backfill branch above also fills the cover, hence the else.)
        void supabase
          .from('recipe_jobs')
          .insert({ url: initial!.source_url, kind: 'cover', meta: { recipe_id: data.id } })
      }

      navigate(`/recipe/${data.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recipe.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40'

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Review & save</h1>
      {sourceLabel && (
        <p className="mt-1 text-sm text-stone-500">
          From {initial.source_author ? `${initial.source_author} · ` : ''}
          <a href={initial.source_url ?? '#'} target="_blank" rel="noreferrer" className="text-paprika-700 hover:underline">
            {sourceLabel}
          </a>
        </p>
      )}

      {banner && (
        <p className="mt-4 rounded-xl bg-paprika-50 px-4 py-3 text-sm text-paprika-800">{banner.text}</p>
      )}

      <div className="mt-6 space-y-5 rounded-2xl bg-paper p-6 shadow-card">
        {initial.image_url && (
          <img src={initial.image_url} alt="" className="h-44 w-full rounded-xl object-cover" />
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Servings</label>
            <input value={servings} onChange={(e) => setServings(e.target.value)} className={inputClass} placeholder="4" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Prep (min)</label>
            <input value={prep} onChange={(e) => setPrep(e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Cook (min)</label>
            <input value={cook} onChange={(e) => setCook(e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
        </div>

        <EditableList
          label="Ingredients"
          items={ingredients}
          setItems={setIngredients}
          updateList={updateList}
          placeholder="2 cups flour"
        />
        <EditableList label="Steps" items={steps} setItems={setSteps} updateList={updateList} placeholder="Describe a step…" ordered />

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Tags (comma-separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="dinner, pasta" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Your notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="Tweaks, who liked it, etc." />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-paprika-700 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save to library'}
        </button>
        <button onClick={() => navigate('/')} className="rounded-xl px-5 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100">
          Cancel
        </button>
      </div>
    </div>
  )
}

function EditableList({
  label,
  items,
  setItems,
  updateList,
  placeholder,
  ordered = false,
}: {
  label: string
  items: string[]
  setItems: (v: string[]) => void
  updateList: (list: string[], i: number, v: string) => string[]
  placeholder?: string
  ordered?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            {ordered && <span className="mt-2.5 w-5 shrink-0 text-right text-xs text-stone-400">{i + 1}.</span>}
            <textarea
              value={item}
              onChange={(e) => setItems(updateList(items, i, e.target.value))}
              rows={ordered ? 2 : 1}
              placeholder={placeholder}
              className="flex-1 resize-y rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="mt-1.5 rounded-lg px-2 py-1 text-stone-400 transition hover:bg-stone-100 hover:text-red-600"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setItems([...items, ''])}
        className="mt-2 text-sm font-medium text-paprika-700 hover:underline"
      >
        + Add {label.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  )
}
