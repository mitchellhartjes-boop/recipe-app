import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { apiUrl } from '../lib/api'
import { SunIcon, MoonIcon, LogOutIcon, TrashIcon, CheckIcon } from '../components/icons'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-paper shadow-sm">{children}</div>
    </section>
  )
}

// A step of the how-to manual: a labelled source and what to do.
function HowTo({ source, children }: { source: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-stone-100 px-4 py-3.5 last:border-b-0">
      <p className="text-sm font-semibold text-ink">{source}</p>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{children}</p>
    </div>
  )
}

const PLAN_LIMITS: Record<string, number> = { free: 20, pro: 200 }

export default function Settings() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const { dark, toggle } = useTheme()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ plan: string; used: number; limit: number } | null>(null)

  const email = session?.user.email ?? ''
  const userId = session?.user.id

  // This month's imports, so hitting the cap is never a surprise.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const period = new Date().toISOString().slice(0, 7) // YYYY-MM (UTC), matches the server
      const [{ data: prof }, { data: use }] = await Promise.all([
        supabase.from('recipe_profiles').select('plan').eq('user_id', userId).maybeSingle(),
        supabase.from('recipe_usage').select('imports').eq('user_id', userId).eq('period', period).maybeSingle(),
      ])
      if (cancelled) return
      const plan = prof?.plan ?? 'free'
      setUsage({ plan, used: use?.imports ?? 0, limit: PLAN_LIMITS[plan] ?? PLAN_LIMITS.free })
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function deleteAccount() {
    setDeleting(true)
    setError(null)
    try {
      const token = session?.access_token
      if (!token) throw new Error('You are not signed in.')
      const res = await fetch(apiUrl('/.netlify/functions/delete-account'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) throw new Error(body?.message || 'Could not delete your account.')
      // Everything server-side is gone; clear the local session and leave.
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-7 pb-10">
      <Section title="Appearance">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-stone-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600">
            {dark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-ink">{dark ? 'Dark' : 'Light'} mode</span>
            <span className="block text-xs text-stone-500">Tap to switch</span>
          </span>
          {/* Little track so it reads as a toggle, not just a button */}
          <span className={`relative h-6 w-11 rounded-full transition ${dark ? 'bg-paprika-600' : 'bg-stone-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${dark ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>
      </Section>

      {usage && (
        <Section title="Plan">
          <div className="px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">{usage.plan === 'pro' ? 'Pro' : 'Free'}</span>
              <span className="text-xs text-stone-500">
                {usage.used} of {usage.limit} recipes this month
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full transition-all ${usage.used >= usage.limit ? 'bg-red-500' : 'bg-paprika-600'}`}
                style={{ width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {usage.used >= usage.limit
                ? 'You’ve used this month’s recipes — the count resets on the 1st.'
                : `${usage.limit - usage.used} left until the 1st of next month.`}
            </p>
          </div>
        </Section>
      )}

      <Section title="How to use Dilla">
        <HowTo source="Instagram reel or post">
          Tap <b>Share</b> → <b>Dilla</b>. It reads the caption, and if the recipe is “link in bio” or
          in the video, it fetches that too — you just stay in Instagram and get a notification when
          it lands.
        </HowTo>
        <HowTo source="Pinterest">
          Open the pin, tap <b>Share</b> → <b>Dilla</b>. Dilla follows the pin through to the recipe’s
          real website automatically.
        </HowTo>
        <HowTo source="Any website or food blog">
          Use the browser’s <b>Share</b> button on the recipe page and pick <b>Dilla</b>.
        </HowTo>
        <HowTo source="A recipe you can only see on screen">
          <b>Screenshot</b> it and share the image to Dilla. This is the fix for anything that won’t
          import — private posts, age-restricted reels, sites that block apps.
        </HowTo>
        <HowTo source="Can’t find Dilla in the share sheet?">
          Scroll the app row to the end → <b>More</b> → find <b>Dilla</b> and drag it to the front (or
          tap <b>Edit</b> and switch on its <b>Favorite</b>).
        </HowTo>
      </Section>

      <Section title="Account">
        {email && (
          <div className="border-b border-stone-100 px-4 py-3.5">
            <p className="text-xs text-stone-500">Signed in as</p>
            <p className="truncate text-sm font-medium text-ink">{email}</p>
          </div>
        )}
        <button
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3.5 text-left transition active:bg-stone-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600">
            <LogOutIcon className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-ink">Sign out</span>
        </button>
        <button
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-red-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600">
            <TrashIcon className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-red-600">Delete account</span>
            <span className="block text-xs text-stone-500">Permanently erase your recipes and data</span>
          </span>
        </button>
      </Section>

      <p className="px-1 text-center text-xs text-stone-400">Dilla · Recipe Vault</p>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-safe-b sm:items-center" onClick={() => !deleting && setConfirming(false)}>
          <div
            className="w-full max-w-sm rounded-3xl bg-cream p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <TrashIcon className="h-6 w-6" />
            </div>
            <h3 className="text-center font-display text-xl font-semibold">Delete your account?</h3>
            <p className="mt-2 text-center text-sm leading-relaxed text-stone-600">
              This permanently erases <b>every recipe</b>, your grocery list, meal plan, and sign-in.
              It can’t be undone.
            </p>

            {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</p>}

            <button
              onClick={() => void deleteAccount()}
              disabled={deleting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {deleting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Deleting…
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4" /> Yes, delete everything
                </>
              )}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="mt-2 w-full rounded-2xl py-3 text-sm font-medium text-stone-500 transition active:bg-stone-100 disabled:opacity-60"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
