import { useState } from 'react'
import { BookIcon, CartIcon, FlameIcon, PlusIcon, CheckIcon } from './icons'
import { markOnboarded } from '../lib/onboarding'

type Slide = {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const SLIDES: Slide[] = [
  {
    icon: <BookIcon className="h-8 w-8" />,
    title: 'Your recipes, all in one place',
    body: (
      <>
        You save dozens of recipes and cook a handful. Dilla is for that handful — it keeps them
        organized, readable, and ready to actually cook from.
      </>
    ),
  },
  {
    icon: <PlusIcon className="h-8 w-8" />,
    title: 'Send a recipe from anywhere',
    body: (
      <>
        Found a recipe on <b>Instagram</b>, <b>TikTok</b>, <b>Pinterest</b>, or a food blog? Tap
        that app's <b>Share</b> button, then choose <b>Dilla</b> from the share sheet.
        <br />
        <br />
        You stay right where you are — Dilla saves it in the background and sends you a{' '}
        <b>notification</b> when the recipe's in your library, written out properly with every
        amount and step.
      </>
    ),
  },
  {
    icon: <CheckIcon className="h-8 w-8" />,
    title: 'Can’t find Dilla when you share?',
    body: (
      <>
        The first time, iOS hides new apps at the end of the share row.
        <br />
        <br />
        Tap <b>Share</b> → scroll the app row to the end → tap <b>More</b>. Find <b>Dilla</b>, then
        drag it to the top — or tap <b>Edit</b> and switch on <b>Favorite</b>.
        <br />
        <br />
        After that Dilla sits right at the front, every time.
      </>
    ),
  },
  {
    icon: <CheckIcon className="h-8 w-8" />,
    title: 'Recipe’s in the video? Still works',
    body: (
      <>
        Even when a reel never writes the recipe in the caption — it’s just spoken and shown in the
        video — Dilla watches and listens to it and writes the recipe out for you.
        <br />
        <br />
        The only ones it can’t reach are private or age-restricted posts. For those, <b>screenshot
        the recipe</b> and share the image instead — that works for anything you can see.
      </>
    ),
  },
  {
    icon: <FlameIcon className="h-8 w-8" />,
    title: 'Built for the counter',
    body: (
      <>
        Tap <b>Start cooking</b> for one big step at a time, with the screen kept awake while your
        hands are busy. Scale the servings and every amount rescales with it.
      </>
    ),
  },
  {
    icon: <CartIcon className="h-8 w-8" />,
    title: 'Plan the week',
    body: (
      <>
        Add a recipe's ingredients straight to your grocery list — pick just the ones you're missing.
        Jot the week's dinners in <b>This Week's Meals</b>.
      </>
    ),
  },
]

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]

  function finish() {
    markOnboarded()
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-cream pt-safe-t pb-safe-b">
      <div className="flex justify-end px-4 pt-3">
        {!last && (
          <button onClick={finish} className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-400 transition active:opacity-60">
            Skip
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-paprika-700">
          {slide.icon}
        </div>
        <h2 className="font-display text-2xl font-semibold leading-tight">{slide.title}</h2>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-stone-600">{slide.body}</p>
      </div>

      <div className="px-6 pb-6">
        <div className="mb-5 flex justify-center gap-1.5">
          {SLIDES.map((_, n) => (
            <span
              key={n}
              className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-paprika-700' : 'w-1.5 bg-stone-300'}`}
            />
          ))}
        </div>
        <button
          onClick={() => (last ? finish() : setI(i + 1))}
          className="w-full rounded-2xl bg-paprika-700 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98]"
        >
          {last ? 'Start cooking' : 'Next'}
        </button>
      </div>
    </div>
  )
}
