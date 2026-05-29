import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Library from './pages/Library'
import AddRecipe from './pages/AddRecipe'
import ReviewRecipe from './pages/ReviewRecipe'
import RecipeDetail from './pages/RecipeDetail'

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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/" element={<Library />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/review" element={<ReviewRecipe />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
