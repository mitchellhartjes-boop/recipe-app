import { useState } from 'react'
import { BookIcon, CartIcon, FlameIcon, PlusIcon, CheckIcon } from './icons'
import { markOnboarded } from '../lib/onboarding'
import { useAuth } from '../lib/auth'
import { promptForNotifications, registerPushNow } from '../lib/usePushRegistration'

// ---- illustrations ---------------------------------------------------------
// Drawn with the app's own tokens (paper cards, stone shapes, paprika accents)
// so they read as Dilla, hold up in dark mode for free, and never look like a
// pasted screenshot that ages out of date.

/** A post card → share → Dilla, with the notification that closes the loop. */
function ShareFlowArt() {
  return (
    <div className="mb-6 select-none" aria-hidden="true">
      <div className="flex items-center justify-center gap-3">
        {/* the post being shared */}
        <div className="w-24 shrink-0 rounded-2xl bg-paper p-2 shadow-card">
          <div className="flex h-20 items-center justify-center rounded-xl bg-paprika-50 text-3xl">🍝</div>
          <div className="mt-2 h-1.5 w-3/4 rounded-full bg-stone-200" />
          <div className="mt-1 h-1.5 w-1/2 rounded-full bg-stone-200" />
        </div>
        {/* share arrow */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0 text-paprika-600">
          <path d="M4 12h14M13 6l6 6-6 6" />
        </svg>
        {/* Dilla */}
        <img src="/favicon.svg" alt="" className="h-14 w-14 shrink-0 rounded-2xl shadow-card" />
      </div>
      {/* the notification that closes the loop */}
      <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-paper py-1.5 pl-2 pr-3.5 shadow-card">
        <img src="/favicon.svg" alt="" className="h-5 w-5 rounded-md" />
        <span className="text-[11px] font-medium text-ink">Saved to Dilla</span>
        <CheckIcon className="h-3.5 w-3.5 text-paprika-700" />
      </div>
    </div>
  )
}

/** A mock share sheet: the app row, Dilla highlighted, More at the end. */
function ShareSheetArt() {
  return (
    <div className="mb-6 flex justify-center select-none" aria-hidden="true">
      <div className="w-full max-w-[270px] rounded-2xl bg-paper px-3 pb-3 pt-2 shadow-card">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-stone-200" />
        <div className="flex items-start justify-between">
          {['a', 'b', 'c'].map((k) => (
            <div key={k} className="flex w-11 flex-col items-center gap-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100">
                <div className="h-4 w-4 rounded-md bg-stone-200" />
              </div>
              <span className="text-[9px] text-stone-400">App</span>
            </div>
          ))}
          <div className="flex w-11 flex-col items-center gap-1">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl shadow-sm ring-2 ring-paprika-600" />
            <span className="text-[9px] font-semibold text-paprika-700">Dilla</span>
          </div>
          <div className="flex w-11 flex-col items-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-400">
              <span className="mb-1 tracking-widest">…</span>
            </div>
            <span className="text-[9px] text-stone-400">More</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- slides ----------------------------------------------------------------

type Slide = {
  icon: React.ReactNode
  art?: React.ReactNode
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
    art: <ShareFlowArt />,
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
    art: <ShareSheetArt />,
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

// The slide whose body promises a notification — the one honest moment to put
// the system permission dialog up.
const NOTIFY_SLIDE = 1

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { session } = useAuth()
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]

  function finish() {
    markOnboarded()
    // File this device's push token now that the tour is over (prompting here
    // if the user skipped past the notification slide). Fire-and-forget: the
    // app must never wait on it.
    void registerPushNow(session?.user?.id)
    onDone()
  }

  function next() {
    if (i === NOTIFY_SLIDE) {
      // They just read WHY Dilla notifies — ask while it makes sense.
      void promptForNotifications()
    }
    if (last) finish()
    else setI(i + 1)
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
        {slide.art ?? (
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-paprika-50 text-paprika-700">
            {slide.icon}
          </div>
        )}
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
          onClick={next}
          className="w-full rounded-2xl bg-paprika-700 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98]"
        >
          {last ? 'Start cooking' : 'Next'}
        </button>
      </div>
    </div>
  )
}
