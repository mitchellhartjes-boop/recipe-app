import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Converts an anonymous account into a permanent one by attaching an email and
// password. Nothing moves: it is the SAME user id, so every recipe, share key,
// device token, and subscription stays exactly where it is — the account simply
// becomes recoverable.
export default function SecureAccount({
  reason,
  onDone,
}: {
  /** Why we're asking, in the user's terms — the honest version of the ask. */
  reason: string
  onDone?: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Supabase can require the email to be VERIFIED before a password may be
      // set on an anonymous account. With email confirmations off (our setup)
      // the combined call succeeds; if the project is ever switched to require
      // confirmation it fails, so fall back to attaching the email alone and
      // tell the user to confirm. Either way the account stops being anonymous.
      const { error: bothErr } = await supabase.auth.updateUser({ email, password })
      if (bothErr) {
        const { error: emailErr } = await supabase.auth.updateUser({ email })
        if (emailErr) throw emailErr
        setNeedsConfirm(true)
      }
      setDone(true)
      onDone?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save that.'
      // The most common real failure, in plain words.
      setError(/already|registered|exists/i.test(msg) ? 'That email already has an account. Sign in to it instead.' : msg)
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
        {needsConfirm
          ? `Almost there — check ${email} and confirm the link, then set a password from Settings.`
          : `Saved — your recipes are tied to ${email} now.`}
      </p>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <p className="text-sm text-stone-600">{reason}</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
      />
      <input
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Choose a password"
        autoComplete="new-password"
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-paprika-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save my recipes'}
      </button>
    </form>
  )
}
