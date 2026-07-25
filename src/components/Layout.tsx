import { Outlet, useLocation } from 'react-router-dom'
import TopBar from './TopBar'
import BottomNav from './BottomNav'

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />

      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-12">
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
