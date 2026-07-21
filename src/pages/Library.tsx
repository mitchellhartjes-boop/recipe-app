import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useRecipes } from '../lib/useRecipes'
import { CATEGORIES, recipeInCategory, TILE_BG } from '../lib/categories'

const KIND_LABEL: Record<string, string> = {
  link_in_bio: 'Recovering recipe from the blog',
  video: 'Extracting recipe from the video',
  unknown: 'Processing',
}

function Tile({
  to,
  slug,
  label,
  count,
  hero = false,
}: {
  to: string
  slug: string
  label: string
  count: number
  hero?: boolean
}) {
  const span = hero ? 'col-span-2 sm:col-span-3 lg:col-span-4' : ''
  const height = hero ? 'h-36 sm:h-48' : 'h-32 sm:h-40'
  const bg = TILE_BG[slug] ?? TILE_BG.bread
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-2xl shadow-card transition active:scale-[0.98] ${bg} ${span} ${height}`}
    >
      {/* Real food photo (committed static asset), gently zooms on hover. The
          gradient bg shows behind it while it loads / if it ever 404s. */}
      <img
        src={`/categories/${slug}.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      {/* Dark scrim so the label stays readable on any photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <h3 className={`font-display font-semibold leading-tight text-white ${hero ? 'text-2xl' : 'text-lg'}`}>
          {label}
        </h3>
        <p className="mt-0.5 text-xs text-white/85">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </p>
      </div>
    </Link>
  )
}

export default function Library() {
  const location = useLocation()
  const queuedKind = (location.state as { queued?: string } | null)?.queued ?? null
  const { recipes, jobs, loading, dismissJob } = useRecipes()

  // One pass over the recipes to compute each category's count.
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of CATEGORIES) m.set(c.slug, 0)
    for (const r of recipes) {
      for (const c of CATEGORIES) {
        if (recipeInCategory(r, c)) m.set(c.slug, m.get(c.slug)! + 1)
      }
    }
    return m
  }, [recipes])

  // Categories sorted by recipe count (largest first); ties keep their declared
  // order. Empty categories sink to the bottom but still show (ready to fill).
  const sortedCategories = useMemo(
    () =>
      CATEGORIES.map((c, i) => ({ c, i }))
        .sort((a, b) => counts.get(b.c.slug)! - counts.get(a.c.slug)! || a.i - b.i)
        .map(({ c }) => c),
    [counts],
  )

  if (loading) {
    return <div className="py-20 text-center text-sm text-stone-400">Loading your recipes…</div>
  }

  const isEmpty = recipes.length === 0 && jobs.length === 0

  return (
    <div className="space-y-5">
      {queuedKind && (
        <p className="rounded-xl bg-paprika-50 px-4 py-3 text-sm text-paprika-800">
          Queued! {queuedKind === 'video' ? 'Pulling the recipe out of the video' : 'Recovering the full recipe from the blog'} — it’ll
          appear here automatically.
        </p>
      )}

      {jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-paper px-4 py-3 shadow-sm">
              {job.status === 'failed' ? (
                <span className="text-lg">⚠️</span>
              ) : (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-paprika-200 border-t-paprika-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {job.status === 'failed' ? 'Couldn’t process this one' : KIND_LABEL[job.kind] ?? 'Processing'}
                </p>
                <p className="truncate text-xs text-stone-400">{job.error ?? job.url}</p>
              </div>
              {(job.status === 'failed' || job.status === 'queued') && (
                <button
                  onClick={() => void dismissJob(job.id)}
                  className="rounded-lg px-2 py-1 text-xs text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                >
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isEmpty ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-3xl">🍳</div>
          <h2 className="font-display text-2xl font-semibold">Your cookbook is empty</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
            Found a recipe on Instagram? Paste the reel link and it lands here, neatly organized.
          </p>
          <Link
            to="/add"
            className="mt-6 inline-block rounded-full bg-paprika-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800"
          >
            Add your first recipe
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          <Tile hero to="/c/all" slug="all" label="All recipes" count={recipes.length} />
          {sortedCategories.map((c) => (
            <Tile key={c.slug} to={`/c/${c.slug}`} slug={c.slug} label={c.label} count={counts.get(c.slug)!} />
          ))}
        </div>
      )}
    </div>
  )
}
