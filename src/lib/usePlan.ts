import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// Is the signed-in user on Pro? Read from recipe_profiles, which the RevenueCat
// webhook keeps current. Fails closed (free) — a Pro perk briefly unavailable is
// a far smaller problem than giving one away, and the paywall is one tap away.
//
// The answer is stored AS the user id it belongs to, so switching accounts (or
// signing out) can never leave the previous user's Pro status behind: the
// derived value only reads true when the stored id matches the current one.
export function useIsPro(): boolean {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [proForUser, setProForUser] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('recipe_profiles').select('plan').eq('user_id', userId).maybeSingle()
      if (!cancelled && data?.plan === 'pro') setProForUser(userId)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  return Boolean(userId) && proForUser === userId
}
