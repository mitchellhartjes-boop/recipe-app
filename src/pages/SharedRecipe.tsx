import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchSharedRecipe, saveSharedRecipe, type SharedRecipe as Shared } from '../lib/share'
import { useAuth } from '../lib/auth'
import { CheckIcon } from '../components/icons'

// The page a recipient lands on. They may have no account, no app, and no idea
// what Dilla is — this is quite possibly the first thing they ever see of it.
//
// So it renders the recipe FIRST and completely, and asks for nothing. The
// pitch sits underneath, after they have the thing they were sent. A wall in
// front of a recipe a friend sent you is how you get closed, not installed.
export default function SharedRecipe() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [recipe, setRecipe] = useState<Shared | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Shared links are person-to-person and must never be indexed. The header
    // from netlify.toml is the real defence; this covers a client-side
    // navigation, where no fresh document request happens at all.
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex, nofollow'
    document.head.appendChild(tag)
    return () => {
      document.head.removeChild(tag)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!token) return
    fetchSharedRecipe(token)
      .then((r) => !cancelled && setRecipe(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'This link no longer works.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token])

  async function save() {
    if (!recipe) return
    setSaving(true)
    try {
      const id = await saveSharedRecipe(recipe)
      navigate(`/recipe/${id}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.")
      setSaving(false)
    }
  }

  if (loading) return <div className="py-24 text-center text-sm text-stone-400">Loading the recipe…</div>

  if (error || !recipe) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <p className="text-4xl">🔗</p>
        <h1 className="mt-4 font-display text-2xl font-semibold">{error ?? 'This link no longer works.'}</h1>
        <p className="mt-2 text-sm text-stone-500">Shared links last 30 days. Ask whoever sent it for a fresh one.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-paprika-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          See what Dilla does
        </Link>
      </div>
    )
  }

  const ingredients = recipe.ingredients ?? []
  const steps = recipe.steps ?? []

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-paprika-700">Shared with you</p>

      {recipe.image_url && (
        <img src={recipe.image_url} alt="" className="mb-5 aspect-[4/3] w-full rounded-2xl object-cover shadow-card" />
      )}

      <h1 className="font-display text-3xl font-semibold tracking-tight">{recipe.title}</h1>
      {recipe.description && <p className="mt-2 text-sm text-stone-500">{recipe.description}</p>}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
        {recipe.servings && <span>Serves {recipe.servings}</span>}
        {recipe.prep_minutes ? <span>Prep {recipe.prep_minutes} min</span> : null}
        {recipe.cook_minutes ? <span>Cook {recipe.cook_minutes} min</span> : null}
      </div>

      {/* Attribution travels with the recipe. Whoever made it stays credited
          however many libraries it passes through. */}
      {(recipe.source_author || recipe.source_url) && (
        <p className="mt-4 text-xs text-stone-400">
          {recipe.source_author ? `From ${recipe.source_author}` : 'From the web'}
          {recipe.source_url && (
            <>
              {' · '}
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-stone-600">
                View original
              </a>
            </>
          )}
        </p>
      )}

      <section className="mt-7">
        <h2 className="font-display text-lg font-semibold">Ingredients</h2>
        <ul className="mt-3 space-y-1.5">
          {ingredients.map((ing, i) => (
            <li key={i} className="text-sm text-ink">
              {ing.raw}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="font-display text-lg font-semibold">Steps</h2>
        <ol className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paprika-50 text-[11px] font-semibold text-paprika-700">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Only now, once they've read what they came for. */}
      <div className="mt-10 rounded-2xl bg-paper p-6 text-center shadow-card">
        {session ? (
          <>
            <p className="text-sm text-stone-600">Keep this one in your own library.</p>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="mt-3 w-full rounded-xl bg-paprika-700 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save to my library'}
            </button>
            <p className="mt-2 text-xs text-stone-400">Free — saving a shared recipe doesn’t use a monthly import.</p>
          </>
        ) : (
          <>
            <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-12 w-12 rounded-2xl shadow-sm" />
            <p className="font-display text-lg font-semibold">Keep every recipe you love</p>
            <p className="mt-1.5 text-sm text-stone-500">
              Dilla saves recipes from reels, videos, and blogs — written out properly, ready to cook from.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block w-full rounded-xl bg-paprika-700 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800"
            >
              Start cooking — no signup
            </Link>
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-stone-400">
              <CheckIcon className="h-3 w-3" /> Free, no card
            </p>
          </>
        )}
      </div>
    </div>
  )
}
