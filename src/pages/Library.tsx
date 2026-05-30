import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Recipe, RecipeJob } from '../lib/types'

const KIND_LABEL: Record<string, string> = {
  link_in_bio: 'Recovering recipe from the blog',
  video: 'Extracting recipe from the video',
  unknown: 'Processing',
}

export default function Library() {
  const location = useLocation()
  const queuedKind = (location.state as { queued?: string } | null)?.queued ?? null

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [jobs, setJobs] = useState<RecipeJob[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const [r, j] = await Promise.all([
      supabase.from('recipe_recipes').select('*').eq('status', 'saved').order('created_at', { ascending: false }),
      supabase.from('recipe_jobs').select('*').in('status', ['queued', 'processing', 'failed']).neq('kind', 'cover').order('created_at', { ascending: false }),
    ])
    setRecipes((r.data ?? []) as Recipe[])
    setJobs((j.data ?? []) as RecipeJob[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
    const channel = supabase
      .channel('library-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_recipes' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_jobs' }, () => void refetch())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  async function dismissJob(id: string) {
    setJobs((prev) => prev.filter((x) => x.id !== id))
    await supabase.from('recipe_jobs').delete().eq('id', id)
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-stone-400">Loading your recipes…</div>
  }

  const isEmpty = recipes.length === 0 && jobs.length === 0

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your recipes</h1>
        {recipes.length > 0 && <span className="text-sm text-stone-400">{recipes.length}</span>}
      </div>

      {queuedKind && (
        <p className="mb-5 rounded-xl bg-paprika-50 px-4 py-3 text-sm text-paprika-800">
          Queued! {queuedKind === 'video' ? 'Pulling the recipe out of the video' : 'Recovering the full recipe from the blog'} — it’ll
          appear here automatically. (Make sure your recipe worker is running.)
        </p>
      )}

      {jobs.length > 0 && (
        <div className="mb-6 space-y-2">
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
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-3xl">🍲</div>
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <Link
              key={r.id}
              to={`/recipe/${r.id}`}
              className="group overflow-hidden rounded-2xl bg-paper shadow-card transition hover:-translate-y-0.5"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">🍽️</div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-display text-lg font-semibold leading-snug">{r.title}</h3>
                {r.source_author && <p className="mt-1 text-xs text-stone-400">{r.source_author}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
