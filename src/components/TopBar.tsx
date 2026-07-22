import { type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { categoryBySlug } from '../lib/categories'
import { ChevronLeftIcon, SunIcon, MoonIcon } from './icons'

function titleFor(path: string): string {
  if (path.startsWith('/add')) return 'Add recipe'
  if (path.startsWith('/review')) return 'Review & save'
  if (path.startsWith('/search')) return 'Search'
  if (path.startsWith('/grocery')) return 'Grocery list'
  if (path.startsWith('/c/')) {
    const slug = path.split('/')[2]
    if (slug === 'all') return 'All recipes'
    return categoryBySlug(slug)?.label ?? 'Recipes'
  }
  if (path.startsWith('/recipe/')) return 'Recipe'
  return ''
}

function ThemeToggle({ className = '' }: { className?: string }) {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 active:scale-95 ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  )
}

function DesktopLink({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
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
  const { signOut, session } = useAuth()

  const isHome = pathname === '/'
  // Home + the other bottom-nav tabs are top-level (title + avatar, no back button).
  const isPrimary = isHome || pathname.startsWith('/search') || pathname.startsWith('/grocery')
  const initial = (session?.user.email?.[0] ?? '?').toUpperCase()

  function account() {
    if (confirm('Sign out?')) void signOut()
  }

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
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <button
                onClick={account}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-paprika-50 text-sm font-semibold text-paprika-800 transition active:scale-95"
                aria-label="Account"
              >
                {initial}
              </button>
            </div>
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
            <ThemeToggle className="justify-self-end" />
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
          <ThemeToggle className="ml-1" />
          <button
            onClick={() => void signOut()}
            className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
            title={session?.user.email ?? 'Sign out'}
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  )
}
