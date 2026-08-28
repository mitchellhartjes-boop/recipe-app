import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// 'welcome' is the DEFAULT and the whole point: a new user should be importing
// a recipe within seconds, not filling in a form. Anonymous sign-in creates a
// real account (real user id, real row-level security, real quota) — it just
// never asks them to type anything. Securing it with an email comes later, and
// is required before they can subscribe (see Upgrade).
type Mode = 'welcome' | 'signin' | 'signup' | 'forgot'

// Where the password-reset email should land. On the web this origin is the
// site itself; in the native app the origin is capacitor://localhost, which an
// email link can never open — so fall back to the deployed web app, where the
// user resets and then signs in on their phone with the new password.
const RESET_REDIRECT = `${import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? window.location.origin : '')}/reset`

export default function Login() {
  const [mode, setMode] = useState<Mode>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function startCooking() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      // Fall back to the form SILENTLY. The user asked to start cooking, not to
      // hear about our auth configuration — an error here reads as "the app is
      // broken" on the very first tap, which is worse than the signup screen we
      // were trying to get rid of. A neutral line explains why the screen moved.
      //
      // This is deliberately not a feature flag: it is correct whether anonymous
      // sign-ins are off (as during rollout), or momentarily unavailable, or
      // rate limited. The screen is right in every state without a redeploy.
      setMode('signup')
      setNotice('Create an account and you’re in — it only takes a moment.')
      setBusy(false)
    }
    // On success the auth listener swaps the whole screen out; leave `busy` set
    // so the button can't be double-tapped during the transition.
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT })
        if (error) throw error
        // Same message whether or not the account exists — a different reply
        // for known emails would let anyone probe who has an account.
        setNotice('If that email has an account, a reset link is on its way. Open it and choose a new password.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const title = mode === 'forgot' ? 'Reset your password' : 'Dilla'
  const cta = busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'

  return (
    <div className="flex min-h-full items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-card" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {mode === 'forgot' ? 'We’ll email you a link to choose a new one.' : 'Every recipe you love, in one place.'}
          </p>
        </div>

        {mode === 'welcome' ? (
          <div className="rounded-2xl bg-paper p-6 shadow-card">
            <button
              onClick={() => void startCooking()}
              disabled={busy}
              className="w-full rounded-xl bg-paprika-700 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'One moment…' : 'Start cooking'}
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-stone-500">
              No signup, no password. Add an email later so your recipes follow you to a new phone.
            </p>
            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-paper p-6 shadow-card">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
                placeholder="you@example.com"
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
                  placeholder="••••••••"
                />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-paprika-700">{notice}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-paprika-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
            >
              {cta}
            </button>
          </form>
        )}

        {mode === 'signin' && (
          <p className="mt-3 text-center">
            <button onClick={() => switchMode('forgot')} className="text-sm text-stone-400 hover:text-stone-600 hover:underline">
              Forgot your password?
            </button>
          </p>
        )}

        <p className="mt-4 text-center text-sm text-stone-500">
          {mode === 'welcome' ? (
            <>
              Already have an account?{' '}
              <button onClick={() => switchMode('signin')} className="font-medium text-paprika-700 hover:underline">
                Sign in
              </button>
            </>
          ) : mode === 'signin' ? (
            <>
              New here?{' '}
              <button onClick={() => switchMode('welcome')} className="font-medium text-paprika-700 hover:underline">
                Start without signing up
              </button>
            </>
          ) : (
            <>
              {mode === 'forgot' ? 'Remembered it?' : 'Already have an account?'}{' '}
              <button onClick={() => switchMode('signin')} className="font-medium text-paprika-700 hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
