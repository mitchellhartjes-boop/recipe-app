import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { usePushRegistration } from './lib/usePushRegistration'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Library from './pages/Library'
import Category from './pages/Category'
import Grocery from './pages/Grocery'
import AddRecipe from './pages/AddRecipe'
import ReviewRecipe from './pages/ReviewRecipe'
import RecipeDetail from './pages/RecipeDetail'
import Settings from './pages/Settings'
import ResetPassword from './pages/ResetPassword'
import Upgrade from './pages/Upgrade'
import Discover from './pages/Discover'
import Landing from './pages/Landing'
import EditRecipe from './pages/EditRecipe'
import NewRecipe from './pages/NewRecipe'
import { Capacitor } from '@capacitor/core'
import { initReviewClock } from './lib/reviewPrompt'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="grid min-h-full place-items-center text-sm text-stone-400">Loading…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Routes password-reset email links to the reset screen. Supabase signs the
// link's recovery token in wherever it lands (often the site root, since the
// allow-list can fall back to the Site URL) and fires PASSWORD_RECOVERY — so
// listen globally and steer to /reset rather than trusting the landing path.
function RecoveryRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset', { replace: true })
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])
  return null
}

export default function App() {
  const { session, loading } = useAuth()
  // Register for push once there's a signed-in user, and re-register if the
  // account changes — the token is filed against whoever is signed in.
  usePushRegistration(session?.user?.id)
  // Starts the install-age clock the review prompt waits on.
  useEffect(() => {
    initReviewClock()
  }, [])
  // Logged-out WEB visitors at the root get the marketing page (first matching
  // route wins). Native app users and signed-in users fall through to the app;
  // while the session is still loading, the Protected route's spinner shows —
  // so returning users never flash the marketing page.
  const showLanding = !Capacitor.isNativePlatform() && !loading && !session
  return (
    <BrowserRouter>
      <RecoveryRedirect />
      <Routes>
        {showLanding && <Route path="/" element={<Landing />} />}
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/" element={<Library />} />
          <Route path="/c/:slug" element={<Category />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/grocery" element={<Grocery />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/review" element={<ReviewRecipe />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/recipe/:id/edit" element={<EditRecipe />} />
          <Route path="/new" element={<NewRecipe />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/upgrade" element={<Upgrade />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
