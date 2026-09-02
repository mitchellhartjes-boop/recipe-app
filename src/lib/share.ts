import { supabase } from './supabase'
import { apiUrl } from './api'
import type { Recipe } from './types'

// Sharing a recipe with someone who might not have Dilla.
//
// The token is a bearer credential: whoever holds the link can read that one
// recipe. That is the point — a link you paste into a group chat has to work
// for someone with no account — but it is why the token is 128 bits of real
// randomness rather than the recipe's id, and why it expires.

/** 16 random bytes, url-safe. Not guessable, not derived from the recipe. */
function mintToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type ShareLink = { token: string; url: string; expiresAt: string }

const linkFor = (token: string) => `${window.location.origin}/s/${token}`

/**
 * Get a working link for a recipe, reusing a live one if it exists.
 *
 * Reuse matters: tapping Share twice should not mint a second credential, and
 * someone re-sending the same recipe to a second person expects the same link
 * rather than a growing pile of independently-revocable ones.
 */
export async function getShareLink(recipe: Pick<Recipe, 'id'>): Promise<ShareLink> {
  const { data: existing } = await supabase
    .from('recipe_shares')
    .select('token, expires_at')
    .eq('recipe_id', recipe.id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) {
    return { token: existing.token, url: linkFor(existing.token), expiresAt: existing.expires_at }
  }

  const token = mintToken()
  const { data, error } = await supabase
    .from('recipe_shares')
    // user_id is set explicitly: the column default cannot see auth.uid() in
    // every context, and a share row attributed to the wrong account would be
    // both unrevocable by its owner and invisible to them.
    .insert({ token, recipe_id: recipe.id, user_id: (await supabase.auth.getUser()).data.user?.id })
    .select('token, expires_at')
    .single()
  if (error) throw new Error("Couldn't create a link for that recipe.")
  return { token: data.token, url: linkFor(data.token), expiresAt: data.expires_at }
}

/** Turn off every live link for a recipe. */
export async function revokeShares(recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('recipe_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('recipe_id', recipeId)
    .is('revoked_at', null)
  if (error) throw new Error("Couldn't turn that link off.")
}

/** Is there a live link for this recipe right now? Drives the button's label. */
export async function hasLiveShare(recipeId: string): Promise<boolean> {
  const { count } = await supabase
    .from('recipe_shares')
    .select('token', { count: 'exact', head: true })
    .eq('recipe_id', recipeId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
  return (count ?? 0) > 0
}

export type SharedRecipe = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'description'
  | 'servings'
  | 'prep_minutes'
  | 'cook_minutes'
  | 'total_minutes'
  | 'ingredients'
  | 'steps'
  | 'tags'
  | 'image_url'
  | 'source_platform'
  | 'source_url'
  | 'source_author'
>

/** Read a shared recipe. No auth — the recipient may have no account at all. */
export async function fetchSharedRecipe(token: string): Promise<SharedRecipe> {
  const res = await fetch(apiUrl(`/.netlify/functions/shared-recipe?token=${encodeURIComponent(token)}`))
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || 'This link no longer works.')
  return body.recipe as SharedRecipe
}

/**
 * Copy a shared recipe into the signed-in viewer's library.
 *
 * Deliberately UNMETERED. There is no extraction to pay for — the recipe is
 * already written — and charging someone an import for accepting a recipe a
 * friend sent them would tax the exact moment we want to encourage.
 *
 * Attribution travels with the copy. A recipe that came from a creator keeps
 * pointing at that creator no matter how many libraries it passes through.
 */
export async function saveSharedRecipe(shared: SharedRecipe): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in first.')
  const { data, error } = await supabase
    .from('recipe_recipes')
    .insert({
      user_id: user.id,
      title: shared.title,
      description: shared.description,
      servings: shared.servings,
      prep_minutes: shared.prep_minutes,
      cook_minutes: shared.cook_minutes,
      total_minutes: shared.total_minutes,
      ingredients: shared.ingredients ?? [],
      steps: shared.steps ?? [],
      tags: shared.tags ?? [],
      image_url: shared.image_url,
      source_platform: shared.source_platform,
      source_url: shared.source_url,
      source_author: shared.source_author,
      status: 'saved',
      extraction_meta: { source_kind: 'shared' },
    })
    .select('id')
    .single()
  if (error) throw new Error("Couldn't save that to your library.")
  return data.id as string
}
