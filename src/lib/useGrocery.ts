import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { GroceryItem } from './types'

// Grocery list data source: live (realtime) list of the user's items, plus the
// mutations the UI needs. Stored in Supabase (table recipe_grocery_items) so the
// list syncs across devices — add on the couch, check off at the store.
export function useGrocery() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('recipe_grocery_items')
      .select('*')
      .order('created_at', { ascending: true })
    setItems((data ?? []) as GroceryItem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on mount; state is set after the await, not synchronously
    void refetch()
    const channel = supabase
      .channel(`grocery-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_grocery_items' }, () => void refetch())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  const addItem = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t) return
    // Optimistic: show the row immediately (realtime echo can lag, esp. when an
    // iOS PWA resumes from background). Reconcile to the real row on success,
    // drop it on failure. Dedupe by id so a realtime refetch can't double-add.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: GroceryItem = {
      id: tempId,
      user_id: '',
      text: t,
      checked: false,
      source_recipe_id: null,
      created_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])
    const { data, error } = await supabase.from('recipe_grocery_items').insert({ text: t }).select('*').single()
    setItems((prev) => {
      const without = prev.filter((x) => x.id !== tempId && (!data || x.id !== data.id))
      return error || !data ? without : [...without, data as GroceryItem]
    })
  }, [])

  const toggle = useCallback(
    async (item: GroceryItem) => {
      const prev = items
      // Optimistic: flip locally so the checkbox responds instantly; restore on error.
      setItems(prev.map((x) => (x.id === item.id ? { ...x, checked: !x.checked } : x)))
      const { error } = await supabase.from('recipe_grocery_items').update({ checked: !item.checked }).eq('id', item.id)
      if (error) setItems(prev)
    },
    [items],
  )

  const remove = useCallback(
    async (id: string) => {
      const prev = items
      setItems(prev.filter((x) => x.id !== id))
      const { error } = await supabase.from('recipe_grocery_items').delete().eq('id', id)
      if (error) setItems(prev) // restore on failure
    },
    [items],
  )

  const clearAll = useCallback(async () => {
    const prev = items
    setItems([])
    // Delete every row owned by the user (RLS scopes this to them). A WHERE that
    // always matches is required — Supabase rejects an unfiltered delete.
    const { error } = await supabase.from('recipe_grocery_items').delete().not('id', 'is', null)
    if (error) setItems(prev) // restore on failure
  }, [items])

  return { items, loading, addItem, toggle, remove, clearAll, refetch }
}

// Add many lines at once (used by a recipe's "Add to Grocery List"). Inserts in
// one round-trip; returns the count added. Skips blanks.
export async function addGroceryItems(lines: string[], sourceRecipeId?: string): Promise<number> {
  const rows = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text, source_recipe_id: sourceRecipeId ?? null }))
  if (!rows.length) return 0
  const { error } = await supabase.from('recipe_grocery_items').insert(rows)
  if (error) throw error
  return rows.length
}
