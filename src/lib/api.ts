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
      reason: 'link_in_bio' | 'video_only' | 'no_recipe'
      message: string
      draft: DraftRecipe
      recover?: { title: string | null; author: string | null; externalUrl: string | null } | null
    }

// Synchronous fast-path extraction (Instagram caption + recipe websites).
export async function extractRecipe(url: string): Promise<ExtractResult> {
  const res = await fetch('/.netlify/functions/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (error) throw error
  return data.id as string
}
