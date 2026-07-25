import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckIcon } from '../components/icons'

// Where the email reset link lands. Opening the link signs the user in with a
// temporary recovery session (Supabase handles the token in the URL), so all
// this page has to do is set the new password on that session.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Those passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — request a new link and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-paprika-50 text-paprika-700">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold">Password updated</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
          You’re signed in. Use the new password next time — including in the Dilla app on your phone.
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="mt-6 rounded-full bg-paprika-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800"
        >
          Back to my recipes
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-center font-display text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3 rounded-2xl bg-paper p-6 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">New password</label>
          <input
            type="password"
            required
            minLength={6}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
            placeholder="At least 6 characters"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Repeat it</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-paprika-400 focus:ring-2 focus:ring-paprika-100 dark:bg-stone-100 dark:focus:ring-paprika-900/40"
            placeholder="Same again"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-paprika-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-paprika-800 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  )
}
