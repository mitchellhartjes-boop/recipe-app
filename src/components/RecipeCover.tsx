import type { Recipe } from '../lib/types'
import { coverFor } from '../lib/categories'

// A recipe's cover: the real photo if it has one, otherwise a designed
// gradient + category-emoji card (so cover-less recipes look intentional, never
// broken). `emojiClass` lets callers size the motif per context.
export default function RecipeCover({
  recipe,
  className = '',
  imgClassName = '',
  emojiClass = 'text-5xl',
  rounded = '',
}: {
  recipe: Recipe
  className?: string
  imgClassName?: string
  emojiClass?: string
  rounded?: string
}) {
  if (recipe.image_url) {
    return (
      <img
        src={recipe.image_url}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover ${imgClassName} ${rounded}`}
      />
    )
  }
  const { bg, emoji } = coverFor(recipe)
  return (
    <div className={`flex h-full w-full items-center justify-center ${bg} ${className} ${rounded}`}>
      <span className={`select-none opacity-80 ${emojiClass}`} aria-hidden="true">
        {emoji}
      </span>
    </div>
  )
}
