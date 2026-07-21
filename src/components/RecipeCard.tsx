import { Link } from 'react-router-dom'
import type { Recipe } from '../lib/types'
import RecipeCover from './RecipeCover'

export default function RecipeCard({ recipe: r }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recipe/${r.id}`}
      className="group overflow-hidden rounded-2xl bg-paper shadow-card transition duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        <RecipeCover
          recipe={r}
          imgClassName="transition duration-300 group-hover:scale-105"
          emojiClass="text-5xl"
        />
      </div>
      <div className="p-3.5 sm:p-4">
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug sm:text-lg">{r.title}</h3>
        {r.source_author && <p className="mt-1 truncate text-xs text-stone-400">{r.source_author}</p>}
      </div>
    </Link>
  )
}
