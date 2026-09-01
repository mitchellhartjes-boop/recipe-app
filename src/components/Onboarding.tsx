import { useState } from 'react'
import { BookIcon, CartIcon, FlameIcon, PlusIcon, CheckIcon, ClockIcon, SearchIcon, CompassIcon, SendIcon, CommentIcon, HeartIcon } from './icons'
import { markOnboarded } from '../lib/onboarding'
import Portal from './Portal'
import { useAuth } from '../lib/auth'
import { promptForNotifications, registerPushNow } from '../lib/usePushRegistration'

// ---- illustrations ---------------------------------------------------------
// Drawn with the app's own tokens (paper cards, stone shapes, paprika accents)
// so they read as Dilla, hold up in dark mode for free, and never look like a
// pasted screenshot that ages out of date.

/** A shelf of saved recipe cards — the library at a glance. */
function LibraryArt() {
  return (
    <div className="mb-6 flex select-none items-end justify-center gap-2.5" aria-hidden="true">
      <div className="w-20 rounded-2xl bg-paper p-2 opacity-80 shadow-card">
        <div className="flex h-14 items-center justify-center rounded-xl bg-paprika-50 text-2xl">🍜</div>
        <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-stone-200" />
      </div>
      <div className="w-24 rounded-2xl bg-paper p-2 shadow-card">
        <div className="flex h-20 items-center justify-center rounded-xl bg-paprika-50 text-3xl">🌮</div>
        <div className="mt-2 h-1.5 w-3/4 rounded-full bg-stone-200" />
        <div className="mt-1.5 text-[9px] leading-none text-amber-400">★★★★★</div>
      </div>
      <div className="w-20 rounded-2xl bg-paper p-2 opacity-80 shadow-card">
        <div className="flex h-14 items-center justify-center rounded-xl bg-paprika-50 text-2xl">🍪</div>
        <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-stone-200" />
      </div>
    </div>
  )
}

/** A cooking video becoming a written-out recipe. */
function VideoArt() {
  return (
    <div className="mb-6 flex select-none items-center justify-center gap-3" aria-hidden="true">
      <div className="w-24 shrink-0 rounded-2xl bg-paper p-2 shadow-card">
        <div className="relative flex h-20 items-center justify-center rounded-xl bg-stone-800 text-3xl">
          🍳
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 pl-0.5 text-[9px] text-stone-900">▶</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-2/3 rounded-full bg-stone-200" />
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0 text-paprika-600">
        <path d="M4 12h14M13 6l6 6-6 6" />
      </svg>
      <div className="w-24 shrink-0 rounded-2xl bg-paper p-2.5 shadow-card">
        <div className="h-1.5 w-1/2 rounded-full bg-paprika-300" />
        <div className="mt-2 h-1.5 w-full rounded-full bg-stone-200" />
        <div className="mt-1 h-1.5 w-5/6 rounded-full bg-stone-200" />
        <div className="mt-1 h-1.5 w-full rounded-full bg-stone-200" />
        <div className="mt-1 h-1.5 w-2/3 rounded-full bg-stone-200" />
        <div className="mt-2 flex items-center gap-1">
          <CheckIcon className="h-3 w-3 text-paprika-700" />
          <div className="h-1.5 w-1/2 rounded-full bg-stone-200" />
        </div>
      </div>
    </div>
  )
}

/** A mini Cook Mode card: step lines, a live timer, an ingredient chip. */
function CookArt() {
  return (
    <div className="mb-6 flex select-none justify-center" aria-hidden="true">
      <div className="w-full max-w-[250px] rounded-2xl bg-paper p-3.5 text-left shadow-card">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-paprika-700">Step 3 of 7</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-stone-200" />
        <div className="mt-1 h-1.5 w-4/5 rounded-full bg-stone-200" />
        <div className="mt-1 h-1.5 w-3/5 rounded-full bg-stone-200" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 rounded-full border border-paprika-200 bg-paprika-50 px-2 py-1 text-[10px] font-semibold tabular-nums text-paprika-800">
            <ClockIcon className="h-3 w-3" /> 11:42
          </span>
          <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-[10px] text-stone-600">
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-paprika-600 text-white">
              <CheckIcon className="h-2 w-2" />
            </span>
            2 cups stock
          </span>
        </div>
      </div>
    </div>
  )
}

/** A search pill and fresh finds — the Discover tab in miniature. */
function DiscoverArt() {
  return (
    <div className="mb-6 select-none" aria-hidden="true">
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-paper py-2 pl-3 pr-4 shadow-card">
        <SearchIcon className="h-3.5 w-3.5 text-stone-400" />
        <span className="text-[11px] font-medium text-ink">chocolate chip cookies</span>
      </div>
      <div className="mt-3 flex items-start justify-center gap-2">
        <div className="w-16 rounded-xl bg-paper p-1.5 opacity-80 shadow-card">
          <div className="flex h-12 items-center justify-center rounded-lg bg-paprika-50 text-xl">🥞</div>
        </div>
        <div className="w-[72px] rounded-xl bg-paper p-1.5 shadow-card">
          <div className="flex h-14 items-center justify-center rounded-lg bg-paprika-50 text-2xl">🍪</div>
          <div className="mx-auto mt-1.5 w-fit rounded-full bg-paprika-700 px-2 py-0.5 text-[8px] font-semibold text-white">Save</div>
        </div>
        <div className="w-16 rounded-xl bg-paper p-1.5 opacity-80 shadow-card">
          <div className="flex h-12 items-center justify-center rounded-lg bg-paprika-50 text-xl">🍩</div>
        </div>
      </div>
    </div>
  )
}

/** A post card → share → Dilla, with the notification that closes the loop. */

/** The pointer that turns an illustration into an instruction. Deliberately in
 *  our own paprika rather than anyone else's pink, and positioned by the caller
 *  so it can hang off whatever it is pointing at. */
function TapHere({ className = '', point = 'down' }: { className?: string; point?: 'up' | 'down' }) {
  const pill = (
    <span className="whitespace-nowrap rounded-full bg-paprika-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-card">
      Tap here
    </span>
  )
  const arrowDown = <span className="-mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-paprika-600" />
  const arrowUp = <span className="-mb-px h-0 w-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-paprika-600" />
  return (
    <span className={`pointer-events-none absolute z-10 flex w-max flex-col items-center ${className}`}>
      {point === 'up' ? arrowUp : null}
      {pill}
      {point === 'down' ? arrowDown : null}
    </span>
  )
}

/** A stylised post with its action rail, the share button ringed. DRAWN, never
 *  a screenshot: a screenshot of someone else's app is theirs, ages out the
 *  moment they redesign, and cannot adapt to dark mode. This only has to be
 *  recognisable enough that the button is findable on the real thing. */
function TapShareArt() {
  return (
    <div className="mb-6 flex select-none justify-center" aria-hidden="true">
      <div className="relative w-[168px] rounded-[22px] border-4 border-stone-800 bg-stone-800 shadow-card">
        {/* Flat stone-800, matching VideoArt. A stone gradient inverts in dark mode
              and rendered light grey at the top - a "video" that is pale on top
              reads as a broken image. Depth comes from a black overlay instead,
              which behaves the same in both themes. */}
          <div className="relative h-[210px] overflow-hidden rounded-[18px] bg-stone-800">
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/40" />
          <span className="absolute inset-0 flex items-center justify-center text-5xl">🍪</span>
          {/* the creator strip, so it reads as a post rather than a video player */}
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-white/25" />
            <span className="h-1.5 w-12 rounded-full bg-white/25" />
          </div>
          {/* action rail - heart, comment, share. Only the share button matters. */}
          <div className="absolute bottom-3 right-2 flex flex-col items-center gap-3 text-white/70">
            <HeartIcon className="h-4 w-4" />
            <CommentIcon className="h-4 w-4" />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-paprika-700 shadow-lg ring-[3px] ring-paprika-500">
              <SendIcon className="h-4 w-4" />
            </span>
          </div>
          <TapHere className="bottom-1 right-11 items-end" />
        </div>
      </div>
    </div>
  )
}

/** A mock share sheet: the app row, Dilla highlighted, More at the end. */
function ShareSheetArt() {
  return (
    <div className="mb-6 flex justify-center select-none" aria-hidden="true">
      <div className="w-full max-w-[270px] rounded-2xl bg-paper px-3 pb-10 pt-2 shadow-card">
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
          <div className="relative flex w-11 flex-col items-center gap-1">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl shadow-sm ring-2 ring-paprika-600" />
            <span className="text-[9px] font-semibold text-paprika-700">Dilla</span>
            <TapHere className="-bottom-7 left-1/2 -translate-x-1/2" point="up" />
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
    art: <LibraryArt />,
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
    art: <TapShareArt />,
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
    art: <VideoArt />,
    title: 'Recipe’s in the video? Still works',
    body: (
      <>
        Even when a reel never writes the recipe in the caption — it’s just spoken and shown in the
        video — Dilla watches and listens to it and writes the recipe out for you.
        <br />
        <br />
        The only ones it can’t reach are private posts and ones the creator has limited to certain
        audiences — nobody else can see those either. For those, <b>screenshot the recipe</b> and
        share the image instead; that works for anything you can see.
      </>
    ),
  },
  {
    icon: <CompassIcon className="h-8 w-8" />,
    art: <DiscoverArt />,
    title: 'Find your next favorite',
    body: (
      <>
        The <b>Discover</b> tab searches TikTok, Pinterest, Instagram, and the web without leaving
        Dilla. See something good? Save it on the spot.
      </>
    ),
  },
  {
    icon: <FlameIcon className="h-8 w-8" />,
    art: <CookArt />,
    title: 'Built for the counter',
    body: (
      <>
        Tap <b>Start cooking</b> for one big step at a time — each step shows just the ingredients
        it needs, and any time in a step becomes a <b>one-tap timer</b>. The screen stays awake
        while your hands are busy, and scaling the servings rescales every amount.
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
    <Portal>
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
    </Portal>
  )
}
