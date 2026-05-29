import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { signOut, session } = useAuth()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-xl font-semibold tracking-tight">Recipe Vault</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link
              to="/add"
              className="rounded-full bg-paprika-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-paprika-800"
            >
              + Add recipe
            </Link>
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Outlet />
      </main>
    </div>
  )
}
