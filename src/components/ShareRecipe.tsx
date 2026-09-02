import { useState } from 'react'
import { getShareLink, revokeShares } from '../lib/share'
import { CheckIcon } from './icons'

// Send a recipe to someone.
//
// Uses the OS share sheet where there is one, which is what people expect on a
// phone and puts Messages, WhatsApp and Mail one tap away. Falls back to
// copying, because navigator.share is absent on desktop browsers and refuses
// outright outside a user gesture or a secure context.
export default function ShareRecipe({ recipeId, title }: { recipeId: string; title: string }) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function share() {
    setBusy(true)
    setError(null)
    try {
      const { url } = await getShareLink({ id: recipeId })
      setLink(url)

      // navigator.share throws on cancel, which is not an error — someone
      // closing the share sheet has not failed at anything.
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title, text: `${title} — a recipe from Dilla`, url })
          return
        } catch {
          /* cancelled, or unavailable — fall through to copying */
        }
      }
      await navigator.clipboard?.writeText(url).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a link.")
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      await revokeShares(recipeId)
      setLink(null)
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn that link off.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => void share()}
        disabled={busy}
        className="text-sm font-medium text-paprika-700 transition hover:underline disabled:opacity-60"
      >
        {busy ? 'One moment…' : 'Share recipe'}
      </button>

      {copied && (
        <span className="flex items-center gap-1 text-xs text-paprika-700">
          <CheckIcon className="h-3 w-3" /> Link copied — anyone with it can read this recipe for 30 days
        </span>
      )}

      {link && !copied && (
        <span className="text-xs text-stone-400">Link active for 30 days</span>
      )}

      {link && (
        <button
          onClick={() => void turnOff()}
          disabled={busy}
          className="text-xs text-stone-400 underline transition hover:text-stone-600 disabled:opacity-60"
        >
          Turn the link off
        </button>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
