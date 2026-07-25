import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { useAuth } from '../lib/auth'
import {
  purchasesAvailable,
  configurePurchases,
  getProOffering,
  purchasePro,
  restorePurchases,
  type ProOffering,
} from '../lib/purchases'
import { CheckIcon, FlameIcon } from '../components/icons'

// Apple requires a Terms of Use link for auto-renewable subscriptions; the
// standard Apple EULA satisfies it without writing our own.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'

const PERKS = [
  '200 recipes every month',
  'Includes 40 video recipes (TikTok & reels)',
  'Everything imports the same way — share and it’s saved',
  'Keeps the pantry stocked for new features first',
]

export default function Upgrade() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [offering, setOffering] = useState<ProOffering | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null)
  const [chosen, setChosen] = useState<'monthly' | 'annual'>('monthly')
  const [done, setDone] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (session?.user?.id) await configurePurchases(session.user.id)
      const off = await getProOffering()
      if (!cancelled) {
        setOffering(off)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const pkg: PurchasesPackage | null = chosen === 'annual' ? (offering?.annual ?? null) : (offering?.monthly ?? null)

  async function buy() {
    if (!pkg) return
    setBusy('purchase')
    setNotice(null)
    const result = await purchasePro(pkg)
    setBusy(null)
    if (result === 'purchased') setDone(true)
    else if (result === 'failed') setNotice('The purchase didn’t go through — nothing was charged. Try again in a moment.')
    // cancelled: user closed the sheet on purpose; no message needed
  }

  async function restore() {
    setBusy('restore')
    setNotice(null)
    const restored = await restorePurchases()
    setBusy(null)
    if (restored) setDone(true)
    else setNotice('No previous purchase found for this Apple ID.')
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-paprika-50 text-paprika-700">
          <FlameIcon className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold">You’re Pro 🎉</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
          200 recipes a month, starting now. Thanks for keeping Dilla cooking.
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
    <div className="mx-auto max-w-sm pb-10">
      <div className="pt-2 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-paprika-50 text-paprika-700">
          <FlameIcon className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Dilla Pro</h1>
        <p className="mt-1.5 text-sm text-stone-500">For the cook whose saved folder never stops growing.</p>
      </div>

      <ul className="mt-6 space-y-2.5 rounded-2xl bg-paper p-5 shadow-card">
        {PERKS.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-paprika-700" />
            {p}
          </li>
        ))}
      </ul>

      {!purchasesAvailable() ? (
        <p className="mt-6 rounded-2xl bg-paper p-5 text-center text-sm text-stone-500 shadow-card">
          Subscriptions are available in the Dilla iPhone app.
        </p>
      ) : loading ? (
        <p className="mt-6 text-center text-sm text-stone-400">Loading plans…</p>
      ) : !offering || (!offering.monthly && !offering.annual) ? (
        <p className="mt-6 rounded-2xl bg-paper p-5 text-center text-sm text-stone-500 shadow-card">
          Plans aren’t available right now — try again in a little while.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-2.5">
            {offering.monthly && (
              <PlanRow
                label="Monthly"
                price={`${offering.monthly.product.priceString} / month`}
                selected={chosen === 'monthly'}
                onSelect={() => setChosen('monthly')}
              />
            )}
            {offering.annual && (
              <PlanRow
                label="Annual"
                price={`${offering.annual.product.priceString} / year`}
                badge="Best value"
                selected={chosen === 'annual'}
                onSelect={() => setChosen('annual')}
              />
            )}
          </div>

          {notice && <p className="mt-3 rounded-xl bg-paprika-50 px-3 py-2 text-center text-sm text-paprika-800">{notice}</p>}

          <button
            onClick={() => void buy()}
            disabled={!pkg || busy !== null}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-paprika-700 py-3.5 text-sm font-semibold text-white shadow-card transition hover:bg-paprika-800 active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'purchase' ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> One moment…
              </>
            ) : (
              'Continue'
            )}
          </button>

          <button
            onClick={() => void restore()}
            disabled={busy !== null}
            className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-stone-500 transition active:bg-stone-100 disabled:opacity-60"
          >
            {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
          </button>

          {/* Apple's required auto-renewal disclosure, in plain words. */}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-stone-400">
            Payment is charged to your Apple ID. The subscription renews automatically unless canceled at
            least 24 hours before the end of the period. Manage or cancel anytime in your App Store
            account settings.
          </p>
          <p className="mt-2 text-center text-[11px] text-stone-400">
            <a href="/privacy/" className="underline underline-offset-2">Privacy Policy</a>
            {' · '}
            <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">Terms of Use</a>
          </p>
        </>
      )}
    </div>
  )
}

function PlanRow({
  label,
  price,
  badge,
  selected,
  onSelect,
}: {
  label: string
  price: string
  badge?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-2xl border-2 bg-paper px-4 py-3.5 text-left shadow-sm transition active:scale-[0.99] ${
        selected ? 'border-paprika-600' : 'border-transparent'
      }`}
    >
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {label}
          {badge && <span className="rounded-full bg-paprika-50 px-2 py-0.5 text-[10px] font-semibold text-paprika-800">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-stone-500">{price}</span>
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
          selected ? 'border-paprika-600 bg-paprika-600 text-white' : 'border-stone-300'
        }`}
      >
        {selected && <CheckIcon className="h-3 w-3" />}
      </span>
    </button>
  )
}
