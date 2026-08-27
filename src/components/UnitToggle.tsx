import type { UnitSystem } from '../lib/units'

const OPTIONS: [UnitSystem, string][] = [
  ['original', 'Original'],
  ['metric', 'Metric'],
  ['us', 'US'],
]

// Pro perk. Shown to everyone deliberately: a locked control the user can see
// converts far better than a feature they never discover, and tapping it lands
// on the paywall at the exact moment they wanted the thing.
export default function UnitToggle({
  value,
  onChange,
  isPro,
  onNeedPro,
}: {
  value: UnitSystem
  onChange: (v: UnitSystem) => void
  isPro: boolean
  onNeedPro: () => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-medium text-stone-400">Units</span>
      {OPTIONS.map(([key, label]) => {
        const active = value === key
        const locked = key !== 'original' && !isPro
        return (
          <button
            key={key}
            onClick={() => (locked ? onNeedPro() : onChange(key))}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
              active ? 'bg-paprika-700 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {label}
            {locked && <span className="ml-1 opacity-70">🔒</span>}
          </button>
        )
      })}
    </div>
  )
}
