import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { categoryBySlug } from '../lib/categories'
import { ChevronLeftIcon, SettingsIcon } from './icons'

function titleFor(path: string): string {
  if (path.startsWith('/add')) return 'Add recipe'
  if (path.startsWith('/review')) return 'Review & save'
  if (path.startsWith('/search')) return 'Search'
  if (path.startsWith('/grocery')) return 'Grocery list'
  if (path.startsWith('/settings')) return 'Settings'
  if (path.startsWith('/c/')) {
    const slug = path.split('/')[2]
    if (slug === 'all') return 'All recipes'
    return categoryBySlug(slug)?.label ?? 'Recipes'
  }
  if (path.startsWith('/recipe/')) return 'Recipe'
  return ''
}

// Gear → the settings page (theme, account, help all live there now). Hidden
// when already on settings so it doesn't point at itself.
function SettingsButton({ className = '' }: { className?: string }) {
  const { pathname } = useLocation()
  if (pathname.startsWith('/settings')) return null
  return (
    <Link
      to="/settings"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 active:scale-95 ${className}`}
      aria-label="Settings"
      title="Settings"
    >
      <SettingsIcon className="h-5 w-5" />
    </Link>
  )
}

function DesktopLink({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-full px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-paprika-50 text-paprika-800' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const isHome = pathname === '/'
  // Home + the other bottom-nav tabs are top-level (title + settings, no back button).
  const isPrimary = isHome || pathname.startsWith('/search') || pathname.startsWith('/grocery')

  return (
    <header className="sticky top-0 z-20 w-full max-w-full border-b border-stone-200/70 bg-cream/80 pt-safe-t backdrop-blur">
      {/* Mobile bar — brand on home, contextual title + back elsewhere */}
      <div className="flex h-14 items-center px-4 sm:hidden">
        {isPrimary ? (
          <>
            {isHome ? (
              <Link to="/" className="flex items-center gap-2">
                <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
                <span className="font-display text-lg font-semibold tracking-tight">Dilla</span>
              </Link>
            ) : (
              <span className="font-display text-lg font-semibold tracking-tight">{titleFor(pathname)}</span>
            )}
            <SettingsButton className="ml-auto" />
          </>
        ) : (
          <div className="grid w-full grid-cols-[auto_1fr_auto] items-center">
            <button
              onClick={() => navigate(-1)}
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition active:bg-stone-100"
              aria-label="Back"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <span className="text-center font-display text-base font-semibold tracking-tight">{titleFor(pathname)}</span>
            <SettingsButton className="justify-self-end" />
          </div>
        )}
      </div>

      {/* Desktop bar — full nav */}
      <div className="mx-auto hidden max-w-5xl items-center justify-between px-5 py-3.5 sm:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-xl font-semibold tracking-tight">Dilla</span>
        </Link>
        <nav className="flex items-center gap-1">
          <DesktopLink to="/" end>
            Recipes
          </DesktopLink>
          <DesktopLink to="/search">Search</DesktopLink>
          <DesktopLink to="/grocery">Grocery</DesktopLink>
          <Link
            to="/add"
            className="ml-1 rounded-full bg-paprika-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-paprika-800"
          >
            + Add recipe
          </Link>
          <SettingsButton className="ml-1" />
        </nav>
      </div>
    </header>
  )
}
