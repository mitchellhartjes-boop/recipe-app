import { useMemo } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { DraftRecipe } from '../lib/api'
import RecipeForm from '../components/RecipeForm'
import { valuesFrom, type CleanedRecipe } from '../lib/recipeForm'

type Banner = { kind: 'info'; text: string } | null

// Review-and-save for a FRESH extraction. The fields live in RecipeForm (shared
// with editing and manual entry); what is unique here is the insert plus the
// follow-up worker jobs that finish an incomplete import.
export default function ReviewRecipe() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { draft?: DraftRecipe; banner?: Banner } | null

  const initial = state?.draft
  const banner = state?.banner ?? null

  const sourceLabel = useMemo(() => {
    if (!initial?.source_url) return null
    try {
      return new URL(initial.source_url).hostname.replace(/^www\./, '')
    } catch {
      return initial.source_url
    }
  }, [initial])

  // Guard: if someone lands here without a draft (e.g. a refresh), send them back.
  if (!initial) return <Navigate to="/add" replace />

  async function handleSave(clean: CleanedRecipe) {
    const { data, error } = await supabase
      .from('recipe_recipes')
      .insert({
        ...clean,
        source_platform: initial!.source_platform,
        source_url: initial!.source_url,
        source_author: initial!.source_author,
        image_url: initial!.image_url,
        status: 'saved',
        extraction_meta: initial!.extraction_meta ?? {},
      })
      .select('id')
      .single()
    if (error) throw error

    const fromVideoPlatform =
      initial!.source_url && /instagram\.com|tiktok\.com/i.test(initial!.source_url)

    // Saved with ingredients but no steps (an ingredients-only caption) from a
    // video platform: queue a steps backfill — the worker watches the video and
    // completes the recipe in place. Unmetered (it finishes an import the user
    // already spent a slot on); the worker validates eligibility. Best-effort,
    // like the cover job below — never blocks the save.
    if (clean.steps.length === 0 && fromVideoPlatform) {
      void supabase
        .from('recipe_jobs')
        .insert({ url: initial!.source_url, kind: 'video', meta: { recipe_id: data.id, backfill: 'steps' } })
    } else if (!initial!.image_url && initial!.source_url && /instagram\.com/i.test(initial!.source_url)) {
      // Instagram's caption embed doesn't expose a usable cover image, so a reel
      // saved through this screen has no photo. The worker pulls the reel's clean
      // cover via Apify and fills it in within a minute or two. (The backfill
      // branch above also fills the cover, hence the else.)
      void supabase
        .from('recipe_jobs')
        .insert({ url: initial!.source_url, kind: 'cover', meta: { recipe_id: data.id } })
    }

    navigate(`/recipe/${data.id}`, { replace: true })
  }

  return (
    <RecipeForm
      heading="Review & save"
      subtitle={
        sourceLabel ? (
          <p className="mt-1 text-sm text-stone-500">
            From {initial.source_author ? `${initial.source_author} · ` : ''}
            <a
              href={initial.source_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="text-paprika-700 hover:underline"
            >
              {sourceLabel}
            </a>
          </p>
        ) : null
      }
      banner={banner?.text ?? null}
      imageUrl={initial.image_url}
      initial={valuesFrom(initial)}
      submitLabel="Save to library"
      submittingLabel="Saving…"
      onSubmit={handleSave}
      onCancel={() => navigate('/')}
    />
  )
}
