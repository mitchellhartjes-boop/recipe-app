import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Recipe, RecipeJob } from './types'

// Shared data source for the library, category, search and favorites screens:
// fetches all saved recipes once + the active job queue, and keeps them live via
// realtime. Client-side filtering off this list powers categories + search
// instantly (personal-scale data, so no per-view round-trips needed).
export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [jobs, setJobs] = useState<RecipeJob[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const [r, j] = await Promise.all([
      supabase
        .from('recipe_recipes')
        .select('*')
        .eq('status', 'saved')
        .order('created_at', { ascending: false }),
      supabase
        .from('recipe_jobs')
        .select('*')
        .in('status', ['queued', 'processing', 'failed'])
        .neq('kind', 'cover')
        .order('created_at', { ascending: false }),
    ])
    setRecipes((r.data ?? []) as Recipe[])
    setJobs((j.data ?? []) as RecipeJob[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on mount; state is set after the await, not synchronously
    void refetch()
    const channel = supabase
      .channel(`recipes-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_recipes' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_jobs' }, () => void refetch())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  const dismissJob = useCallback(async (id: string) => {
    setJobs((prev) => prev.filter((x) => x.id !== id))
    await supabase.from('recipe_jobs').delete().eq('id', id)
  }, [])

  return { recipes, jobs, loading, dismissJob, refetch }
}
