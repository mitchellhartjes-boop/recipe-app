import type { Recipe } from '../lib/types'

// Permanent creator attribution. Every imported recipe shows who it came from
// and links back to the original post — on the recipe page and in cook mode.
//
// This is deliberate and non-removable: the recipe (ingredients + steps) isn't
// copyrightable, but the creator still did the work, and sending traffic back
// to them is what separates "a personal cookbook that remembers where you found
// things" from "an app that launders other people's content."
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function label(recipe: Recipe): string {
  if (recipe.source_author) {
    const a = recipe.source_author.trim()
    // Instagram handles read better with the @; site names don't.
    return recipe.source_platform === 'instagram' && !a.startsWith('@') ? `@${a}` : a
  }
  return (recipe.source_url && hostOf(recipe.source_url)) || 'original post'
}

export default function SourceCredit({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const hasSource = Boolean(recipe.source_url || recipe.source_author)
  if (!hasSource) return null

  const text = label(recipe)
  const via = recipe.source_platform === 'instagram' ? 'Instagram' : hostOf(recipe.source_url ?? '') || 'the web'

  if (compact) {
    return recipe.source_url ? (
      <a
        href={recipe.source_url}
        target="_blank"
        rel="noreferrer"
        className="truncate text-xs text-stone-400 underline-offset-2 hover:text-paprika-700 hover:underline"
      >
        Recipe by {text}
      </a>
    ) : (
      <span className="truncate text-xs text-stone-400">Recipe by {text}</span>
    )
  }

  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-paper px-4 py-3 shadow-card">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paprika-50 text-sm font-semibold text-paprika-800">
        {text.replace(/^@/, '').charAt(0).toUpperCase() || '·'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">Recipe by {text}</p>
        <p className="truncate text-xs text-stone-400">Saved from {via}</p>
      </div>
      {recipe.source_url && (
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full bg-paprika-50 px-3 py-1.5 text-xs font-semibold text-paprika-800 transition active:scale-95"
        >
          View original ↗
        </a>
      )}
    </div>
  )
}
