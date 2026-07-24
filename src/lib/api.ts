import type { Ingredient, SourcePlatform } from './types'
import { supabase } from './supabase'

// A recipe draft as returned by the extract function (pre-save, pre-DB-fields).
export type DraftRecipe = {
  title: string
  description: string | null
  source_platform: SourcePlatform | null
  source_url: string | null
  source_author: string | null
  image_url: string | null
  servings: string | null
  prep_minutes: number | null
  cook_minutes: number | null
  total_minutes: number | null
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  extraction_meta: Record<string, unknown>
}

export type ExtractResult =
  | { ok: true; source_kind: string; recipe: DraftRecipe }
  | {
      ok: false
      reason: 'link_in_bio' | 'video_only' | 'no_recipe' | 'inaccessible'
      message: string
      draft: DraftRecipe
      recover?: { title: string | null; author: string | null; externalUrl: string | null } | null
    }

// Where the serverless functions live. On the web this is same-origin (''), so
// requests stay relative. In the native app the bundle is served from
// capacitor://localhost, which has no functions — so builds set
// VITE_API_BASE to the deployed origin and we call it absolutely.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

export const apiUrl = (path: string) => `${API_BASE}${path}`

// Synchronous fast-path extraction (Instagram caption + recipe websites).
// Sends the session token: extraction costs money on every call, so the endpoint
// only serves signed-in users and meters the request against their monthly cap.
export async function extractRecipe(url: string): Promise<ExtractResult> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  const res = await fetch(apiUrl('/.netlify/functions/extract'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
  })
  const body = (await res.json().catch(() => null)) as (ExtractResult & { error?: string }) | null
  if (!body) throw new Error(`Server error (${res.status})`)
  if ('error' in body && body.error) throw new Error(body.error)
  return body as ExtractResult
}

// Queue a slow job (link-in-bio recovery or video) for the worker to process.
export async function createJob(
  url: string,
  kind: 'link_in_bio' | 'video',
  meta: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await supabase
    .from('recipe_jobs')
    .insert({ url, kind, meta })
    .select('id')
    .single()
  if (error) {
    // A database trigger meters slow jobs (they're the expensive ones), so this
    // is the one error worth translating — otherwise the user sees raw SQL.
    if (/IMPORT_LIMIT_REACHED/.test(error.message)) {
      throw new Error("You've used all of this month's recipe imports. The count resets on the 1st.")
    }
    throw error
  }
  return data.id as string
}
