import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useRecipes } from '../lib/useRecipes'
import { recipeInCategory, TILE_BG } from '../lib/categories'
import { useCategoryPrefs } from '../lib/useCategoryPrefs'
import { useAuth } from '../lib/auth'
import CategoryEditor from '../components/CategoryEditor'
import Onboarding from '../components/Onboarding'
import { hasOnboarded } from '../lib/onboarding'
import { PlusIcon } from '../components/icons'

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
  emoji,
  photoUrl,
  hero = false,
}: {
  to: string
  slug: string
  label: string
  count: number
  emoji?: string
  /** Built-ins resolve to their committed /categories/{slug}.jpg; custom
   *  categories pass a fetched URL. Undefined means show the emoji card. */
  photoUrl?: string
  hero?: boolean
}) {
  const hasPhoto = Boolean(photoUrl)
  const span = hero ? 'col-span-2 sm:col-span-3 lg:col-span-4' : ''
  const height = hero ? 'h-36 sm:h-48' : 'h-32 sm:h-40'
  const bg = TILE_BG[slug] ?? TILE_BG.default
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-2xl shadow-card transition active:scale-[0.98] ${bg} ${span} ${height}`}
    >
      {/* Built-ins have a committed photo. User-created categories don't, so
          they get the gradient + a large emoji instead of a broken image. */}
      {hasPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 bottom-10 flex select-none items-center justify-center text-5xl opacity-80 transition-transform duration-300 group-hover:scale-110"
          aria-hidden="true"
        >
          {emoji ?? '🍽️'}
        </span>
      )}
      {/* Dark scrim so the label stays readable on any photo */}
      {/* Scrim only over a photo; on the light gradient tiles it would just
          muddy the colour, and dark text reads better there. */}
      {hasPhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5" />}
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <h3
          className={`font-display font-semibold leading-tight ${hero ? 'text-2xl' : 'text-lg'} ${
            hasPhoto ? 'text-white' : 'text-ink'
          }`}
        >
          {label}
        </h3>
        <p className={`mt-0.5 text-xs ${hasPhoto ? 'text-white/85' : 'text-stone-600'}`}>
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
  const { visible, all, isVisible, toggle, addCustom, removeCustom } = useCategoryPrefs()
  const [editing, setEditing] = useState(false)
  const [onboarding, setOnboarding] = useState(() => !hasOnboarded())
  const { isAnonymous } = useAuth()
  // Nudge once the library is worth losing — not on day one, when the warning
  // would just be noise. Dismissible and remembered: Settings and the paywall
  // still offer to secure the account, so this never needs to nag.
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem('dilla.secureNudgeDismissed') === '1'
    } catch {
      return false
    }
  })
  const showSecureNudge = isAnonymous && !nudgeDismissed && recipes.length >= 5

  // One pass over the recipes to count each VISIBLE category.
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of visible) m.set(c.slug, 0)
    for (const r of recipes) {
      for (const c of visible) {
        if (recipeInCategory(r, c)) m.set(c.slug, m.get(c.slug)! + 1)
      }
    }
    return m
  }, [recipes, visible])

  // Sorted by recipe count (largest first); ties keep the user's chosen order.
  // Empty categories sink to the bottom but still show (ready to fill).
  const sortedCategories = useMemo(
    () =>
      visible
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (counts.get(b.c.slug) ?? 0) - (counts.get(a.c.slug) ?? 0) || a.i - b.i)
        .map(({ c }) => c),
    [counts, visible],
  )

  if (loading) {
    return <div className="py-20 text-center text-sm text-stone-400">Loading your recipes…</div>
  }

  const isEmpty = recipes.length === 0 && jobs.length === 0

  return (
    <div className="space-y-5">
      {showSecureNudge && (
        <div className="flex items-start gap-3 rounded-xl bg-paprika-50 px-4 py-3">
          <p className="flex-1 text-sm text-paprika-900">
            <b>{recipes.length} recipes saved.</b> They only live on this phone — add an email in{' '}
            <Link to="/settings" className="font-semibold underline underline-offset-2">
              Settings
            </Link>{' '}
            so you can get them back on a new one.
          </p>
          <button
            onClick={() => {
              setNudgeDismissed(true)
              try {
                localStorage.setItem('dilla.secureNudgeDismissed', '1')
              } catch {
                /* private mode — it just reappears next launch */
              }
            }}
            className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-paprika-700/60 transition hover:text-paprika-900"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

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
          <Tile hero to="/c/all" slug="all" label="All recipes" count={recipes.length} photoUrl="/categories/all.jpg" />
          {sortedCategories.map((c) => (
            <Tile
              key={c.slug}
              to={`/c/${c.slug}`}
              slug={c.slug}
              label={c.label}
              count={counts.get(c.slug) ?? 0}
              emoji={c.emoji}
              photoUrl={
                c.slug.startsWith('custom-')
                  ? (c as { photoUrl?: string }).photoUrl
                  : `/categories/${c.slug}.jpg`
              }
            />
          ))}
          {/* Edit tile — same footprint as a category so the grid stays even */}
          <button
            onClick={() => setEditing(true)}
            className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 transition active:scale-[0.98] hover:border-paprika-300 hover:text-paprika-700 sm:h-40"
          >
            <PlusIcon className="h-6 w-6" />
            <span className="text-xs font-medium">Edit categories</span>
          </button>
        </div>
      )}

      {editing && (
        <CategoryEditor
          all={all}
          isVisible={isVisible}
          onToggle={toggle}
          onAddCustom={addCustom}
          onRemoveCustom={removeCustom}
          onClose={() => setEditing(false)}
        />
      )}

      {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
    </div>
  )
}
