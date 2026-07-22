import { NavLink, useLocation } from 'react-router-dom'
import { BookIcon, SearchIcon, CartIcon, PlusIcon } from './icons'

export default function BottomNav() {
  const { pathname } = useLocation()
  // "Recipes" owns home + category views; the rest are their own tabs.
  const recipesActive = pathname === '/' || pathname.startsWith('/c/')

  const tabs: { to: string; label: string; active: boolean; render: (on: boolean) => React.ReactNode; accent?: boolean }[] = [
    { to: '/', label: 'Recipes', active: recipesActive, render: () => <BookIcon className="h-6 w-6" /> },
    { to: '/search', label: 'Search', active: pathname.startsWith('/search'), render: () => <SearchIcon className="h-6 w-6" /> },
    { to: '/grocery', label: 'Grocery', active: pathname.startsWith('/grocery'), render: () => <CartIcon className="h-6 w-6" /> },
    { to: '/add', label: 'Add', active: pathname.startsWith('/add'), render: () => <PlusIcon className="h-6 w-6" />, accent: true },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 w-full max-w-full border-t border-stone-200/70 bg-cream/90 pb-safe-b backdrop-blur-lg sm:hidden">
      <div className="mx-auto grid w-full max-w-md grid-cols-4 px-1 pt-1.5">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className="flex flex-col items-center gap-1 py-2 transition active:opacity-60">
            <span
              className={
                t.accent
                  ? `flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition ${t.active ? 'bg-paprika-800' : 'bg-paprika-700'}`
                  : t.active
                    ? 'text-paprika-700'
                    : 'text-stone-400'
              }
            >
              {t.render(t.active)}
            </span>
            <span className={`text-[11px] font-medium ${t.active && !t.accent ? 'text-paprika-700' : 'text-stone-400'}`}>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
