import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { unregisterDevice } from './usePushRegistration'
import { clearShareKey } from './shareKey'

type AuthContextValue = {
  session: Session | null
  loading: boolean
  /** Signed in without ever giving an email — a real account with real data,
   *  just no way to recover it yet. Drives the "secure your account" nudges. */
  isAnonymous: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  isAnonymous: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    // Detach this device FIRST, while the session still authorizes the delete —
    // otherwise RLS rejects it and the next person to sign in on this phone
    // inherits the previous user's push notifications.
    await unregisterDevice()
    await clearShareKey()
    await supabase.auth.signOut()
  }

  const isAnonymous = Boolean(session?.user?.is_anonymous)

  return (
    <AuthContext.Provider value={{ session, loading, isAnonymous, signOut }}>{children}</AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
