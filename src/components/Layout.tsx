import { Outlet, useLocation } from 'react-router-dom'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import { useSharedContent } from '../lib/useSharedContent'
import { CloseIcon } from './icons'

export default function Layout() {
  const { pathname } = useLocation()
  // Listens for content shared in from iOS's share sheet (native build only).
  const { status, dismiss } = useSharedContent()

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />

      {status.state !== 'idle' && (
        <div className="sticky top-14 z-20 px-4 pt-2">
          <div
            className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm shadow-card ${
              status.state === 'error'
                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-paprika-50 text-paprika-800'
            }`}
          >
            {status.state === 'working' && (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-paprika-200 border-t-paprika-600" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {status.state === 'working' && status.what}
              {status.state === 'done' && `Saved “${status.title}”`}
              {status.state === 'error' && status.message}
            </span>
            {status.state !== 'working' && (
              <button onClick={dismiss} className="shrink-0 opacity-60" aria-label="Dismiss">
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-12">
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
