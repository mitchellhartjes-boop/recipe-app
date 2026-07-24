import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { usePushRegistration } from './lib/usePushRegistration'
import Layout from './components/Layout'
import Login from './pages/Login'
import Library from './pages/Library'
import Category from './pages/Category'
import Search from './pages/Search'
import Grocery from './pages/Grocery'
import AddRecipe from './pages/AddRecipe'
import ReviewRecipe from './pages/ReviewRecipe'
import RecipeDetail from './pages/RecipeDetail'
import Settings from './pages/Settings'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="grid min-h-full place-items-center text-sm text-stone-400">Loading…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { session } = useAuth()
  // Register for push once there's a signed-in user, and re-register if the
  // account changes — the token is filed against whoever is signed in.
  usePushRegistration(session?.user?.id)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/" element={<Library />} />
          <Route path="/c/:slug" element={<Category />} />
          <Route path="/search" element={<Search />} />
          <Route path="/grocery" element={<Grocery />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/review" element={<ReviewRecipe />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
