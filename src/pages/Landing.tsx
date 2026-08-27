import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon, FlameIcon, ClockIcon, CartIcon } from '../components/icons'

// Marketing landing page — rendered ONLY for logged-out visitors on the WEB at
// the root path (see App.tsx). Native app users and signed-in web users never
// see this. Content per docs/marketing-specs/landing-page.md; the language
// guardrail applies everywhere here: Dilla GETS the recipe / WRITES it down —
// "download"/"save videos" must never appear on this page.

// Swap for the official App Store badge + real link on approval day
// (marketing spec: A-day task, also adds the apple-itunes-app smart banner).
const APP_STORE_URL: string | null = 'https://apps.apple.com/app/id6793520987'

function AppStoreButton() {
  const cls =
    'inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-white shadow-card transition hover:bg-stone-800 active:scale-[0.98] dark:bg-stone-100 dark:text-stone-900'
  const inner = (
    <>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
        <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.73 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.44 11.5.96 1.39 2.1 2.95 3.6 2.89 1.44-.06 1.99-.93 3.73-.93 1.74 0 2.23.93 3.76.9 1.56-.03 2.54-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.57-3.25-.03-.02-3.01-1.16-3.02-4.6Z" />
        <path d="M14.16 4.06c.8-.96 1.33-2.3 1.18-3.64-1.14.05-2.53.76-3.35 1.72-.74.85-1.38 2.22-1.2 3.53 1.27.1 2.57-.65 3.37-1.61Z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wide opacity-80">
          {APP_STORE_URL ? 'Download on the' : 'Coming soon to the'}
        </span>
        <span className="block text-base font-semibold">App Store</span>
      </span>
    </>
  )
  return APP_STORE_URL ? (
    <a href={APP_STORE_URL} className={cls}>{inner}</a>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

const PILLARS = [
  {
    icon: <CheckIcon className="h-5 w-5" />,
    title: 'It writes it down',
    body: 'Title, ingredients, numbered steps — the full recipe as text, even when it was only ever spoken aloud in the video. "Recipe in my bio"? Dilla follows the trail to the creator\'s site and gets the real one.',
  },
  {
    icon: <FlameIcon className="h-5 w-5" />,
    title: 'You never leave your scroll',
    body: 'Share the post to Dilla and keep scrolling. A notification tells you when the recipe is in your library — with the creator credited and linked, every time.',
  },
  {
    icon: <ClockIcon className="h-5 w-5" />,
    title: 'Saved ≠ cooked — until now',
    body: 'Cook Mode walks you through step by step, shows exactly the ingredients each step needs, and turns "simmer 25 minutes" into a one-tap timer. The screen stays awake; your hands stay floury.',
  },
]

const FAQS = [
  {
    q: 'How does it work?',
    a: 'Find a recipe anywhere — a reel, a pin, a blog, a screenshot — and share it to Dilla. Our server reads the post and writes the recipe out as text in your private library. Nothing to copy, nothing to type.',
  },
  {
    q: 'What if the recipe is only spoken in the video?',
    a: 'That\'s Dilla\'s specialty. It listens to the audio and reads any on-screen text, then writes the full recipe down. The video itself stays right where it is, on the platform.',
  },
  {
    q: 'What about "recipe in my bio" posts?',
    a: 'Dilla follows the link trail to the creator\'s own site and gets the complete recipe from there — automatically, in seconds.',
  },
  {
    q: 'What happens to my data?',
    a: 'Your library is private and personal. No ads, no tracking, and you can delete your account — and everything with it — anytime from Settings.',
  },
  {
    q: 'Web or iPhone?',
    a: 'Both, one account. The iPhone app has the share-sheet magic and Cook Mode by the stove; the web app is your library on any screen.',
  },
]

export default function Landing() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  async function subscribe(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'form-name': 'launch-updates', email }).toString(),
      })
      setSubscribed(true)
    } catch {
      setSubscribed(true) // best-effort — never strand the visitor on an error
    }
  }

  return (
    <div className="min-h-full bg-cream text-ink">
      {/* ── nav ─────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-xl font-semibold tracking-tight">Dilla</span>
        </div>
        <Link
          to="/login"
          className="rounded-full bg-paper px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:text-paprika-700"
        >
          Open the web app
        </Link>
      </header>

      {/* ── hero ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 text-center sm:pt-16">
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Share a reel. Get the recipe.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
          Dilla writes down the recipes you save on TikTok, Instagram, and Pinterest — even when
          they're only spoken in the video.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <AppStoreButton />
          <Link
            to="/login"
            className="rounded-xl px-5 py-3 text-sm font-semibold text-paprika-700 transition hover:underline"
          >
            Try the web app →
          </Link>
        </div>
        {/* Marketing supplies a 15s muted demo loop for this slot; the store
            hero frame stands in until then. */}
        <img
          src="/press/assets/screenshots/01-share-story.png"
          alt="A shared cooking video becoming a written recipe in Dilla"
          className="mx-auto mt-12 w-full max-w-sm rounded-3xl shadow-card"
          loading="lazy"
        />
      </section>

      {/* ── pillars ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl bg-paper p-6 shadow-card">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-paprika-50 text-paprika-700">
                {p.icon}
              </div>
              <h2 className="font-display text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── pricing ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-center font-display text-3xl font-semibold tracking-tight">
          Honest pricing
        </h2>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* NOTE: numbers must match plan_limits() — update here when v2 tightens the free tier. */}
          <div className="rounded-2xl bg-paper p-6 shadow-card">
            <h3 className="font-display text-xl font-semibold">Free</h3>
            <p className="mt-1 text-3xl font-semibold">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-stone-600">
              <li>20 recipe imports a month</li>
              <li>Including 5 video extractions</li>
              <li>Cook Mode, grocery list, meal planning — all of it</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-paprika-600 bg-paper p-6 shadow-card">
            <h3 className="font-display text-xl font-semibold">Pro</h3>
            <p className="mt-1 text-3xl font-semibold">
              $4.99<span className="text-base font-normal text-stone-500">/mo</span>
            </p>
            <p className="text-sm text-stone-500">or $29.99/year</p>
            <ul className="mt-4 space-y-2 text-sm text-stone-600">
              <li>200 recipe imports a month</li>
              <li>Including 40 video extractions</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-stone-500">
          No ads. No tracking. Delete your account — and everything with it — anytime.
        </p>
        <p className="mt-2 text-center text-sm text-stone-500">
          Every recipe keeps its creator's name and a link back.{' '}
          <a href="mailto:mitchellhartjes@gmail.com" className="text-paprika-700 hover:underline">
            Creators: say hi.
          </a>
        </p>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pb-16">
        <h2 className="text-center font-display text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-paper p-5 shadow-card">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                {f.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── email capture ───────────────────────────────────── */}
      <section className="mx-auto max-w-xl px-5 pb-20 text-center">
        <div className="rounded-2xl bg-paper p-8 shadow-card">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-paprika-50 text-paprika-700">
            <CartIcon className="h-5 w-5" />
          </div>
          {subscribed ? (
            <p className="font-medium">You're on the list — see you at launch. 🎉</p>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold">Get launch updates</h2>
              <form onSubmit={(e) => void subscribe(e)} className="mt-4 flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 dark:bg-stone-100"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-paprika-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-paprika-800 active:scale-95"
                >
                  Notify me
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ── footer ──────────────────────────────────────────── */}
      <footer className="border-t border-stone-200/70 py-8 text-center text-sm text-stone-500">
        <a href="/privacy/" className="mx-2 hover:text-paprika-700">Privacy</a>
        <a href="/support/" className="mx-2 hover:text-paprika-700">Support</a>
        <Link to="/login" className="mx-2 hover:text-paprika-700">Sign in</Link>
        <p className="mt-2">© 2026 Mitch Hartjes</p>
      </footer>
    </div>
  )
}
