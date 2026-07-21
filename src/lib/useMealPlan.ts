import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

const SLOTS = 5

// Weekly meal plan: a single row per user holding 5 free-text slots. Stored in
// Supabase (recipe_meal_plan) so it syncs across devices. Writes are debounced
// so typing doesn't hammer the DB, but any pending write is FLUSHED immediately
// when the tab is hidden / the app is backgrounded / the component unmounts —
// otherwise iOS freezes the pending timer on navigation and the edit is lost.
export function useMealPlan() {
  const [meals, setMeals] = useState<string[]>(() => Array(SLOTS).fill(''))
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<number | null>(null)
  const pending = useRef<string[] | null>(null) // latest unsaved value, or null when nothing is pending
  const auth = useRef<{ uid: string; token: string } | null>(null) // cached for keepalive writes

  const save = useCallback(async (next: string[]) => {
    pending.current = null
    // NOTE: a Supabase query only executes when awaited/then'd — a bare
    // `void supabase...upsert()` silently never fires. Must await it.
    const { error } = await supabase
      .from('recipe_meal_plan')
      .upsert({ meals: next, updated_at: new Date().toISOString() })
    if (error) pending.current = next // keep it pending so a later flush retries
  }, [])

  // Flush a pending save NOW. Two paths: on a normal tab switch the page stays
  // alive, so the awaited `save()` completes fine. On app background / unload the
  // page can freeze mid-request, so we use `fetch(keepalive)` straight to the
  // REST endpoint — that survives unload where a normal query would be killed.
  const flush = useCallback(
    (viaBeacon = false) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const next = pending.current
      if (!next) return
      if (viaBeacon && auth.current) {
        pending.current = null
        // PostgREST upsert: POST with Prefer resolution=merge-duplicates.
        void fetch(`${SUPABASE_URL}/rest/v1/recipe_meal_plan?on_conflict=user_id`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${auth.current.token}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ user_id: auth.current.uid, meals: next, updated_at: new Date().toISOString() }),
        }).catch(() => {})
      } else {
        void save(next)
      }
    },
    [save],
  )

  const fetchPlan = useCallback(async () => {
    // Never clobber locally-typed-but-unsaved edits (initial load or a realtime
    // echo landing while the user is mid-type).
    if (pending.current) return
    // Cache auth for keepalive writes on unload.
    const { data: sess } = await supabase.auth.getSession()
    if (sess.session) auth.current = { uid: sess.session.user.id, token: sess.session.access_token }
    if (pending.current) return
    const { data } = await supabase.from('recipe_meal_plan').select('meals').maybeSingle()
    if (pending.current) return // re-check after the await
    const stored = (data?.meals as string[] | undefined) ?? []
    setMeals(Array.from({ length: SLOTS }, (_, i) => stored[i] ?? ''))
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchPlan()
    const channel = supabase
      .channel(`meal-plan-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_meal_plan' }, () => void fetchPlan())
      .subscribe()

    // Backgrounding / navigating away can freeze the page mid-request, so use the
    // keepalive path here.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      flush() // flush on unmount (e.g. switching bottom-nav tabs) — page stays alive
      void supabase.removeChannel(channel)
    }
  }, [fetchPlan, flush])

  const persist = useCallback((next: string[]) => {
    pending.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      save(next)
    }, 600)
  }, [save])

  const setMeal = useCallback(
    (index: number, value: string) => {
      setMeals((prev) => {
        const next = [...prev]
        next[index] = value
        persist(next)
        return next
      })
    },
    [persist],
  )

  return { meals, loading, setMeal }
}
