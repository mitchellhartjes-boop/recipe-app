import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { ensureShareKey } from './shareKey'

// Registers this device for push notifications and files the APNs token against
// the signed-in user.
//
// Why push at all: the slow imports (a video reel, a link-in-bio recovery that
// needs the worker) finish minutes after the share, by which time the app is
// suspended and cannot fire a local notification. Only a remote push reaches the
// user then. The instant paths keep using local notifications from the share
// extension — this is purely for the async ones.
//
// Native only. On the web build the plugin is unavailable and this no-ops, which
// is why every call is behind an isNativePlatform check.

/** Ask, register, and store — returns the token so callers can log/debug. */
async function registerDevice(userId: string) {
  // requestPermissions returns the CURRENT state when already decided, so this
  // is safe to call on every launch: iOS only prompts while undetermined.
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return null

  // Resolve the token via the one-shot listener rather than a return value —
  // register() only kicks off APNs registration; the token arrives async.
  const token = await new Promise<string | null>((resolve) => {
    let settled = false
    const done = (value: string | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    void PushNotifications.addListener('registration', (t) => done(t.value))
    void PushNotifications.addListener('registrationError', () => done(null))
    void PushNotifications.register()
    // APNs can be slow or silent (airplane mode, no APNs reachability). Give up
    // rather than leaving the promise dangling for the life of the session.
    setTimeout(() => done(null), 15_000)
  })
  if (!token) return null

  // onConflict token — NOT (user_id, token). The token is the device, so if a
  // different account signs in on this phone the row must MOVE to them; keyed
  // any other way the previous user would keep receiving this device's pushes.
  await supabase
    .from('device_tokens')
    .upsert(
      { token, user_id: userId, platform: 'ios', last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    )
  return token
}

export function usePushRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return
    let cancelled = false

    void (async () => {
      // Independent of push: the Share Extension needs this to import as the
      // right user, so it must not be skipped when notifications are declined.
      try {
        await ensureShareKey(userId)
      } catch (e) {
        console.warn('[shareKey] setup failed', e)
      }
      try {
        const token = await registerDevice(userId)
        if (!cancelled && token) console.info('[push] registered')
      } catch (e) {
        // Never let a push failure break the app — it is an enhancement, and
        // the recipe still lands in the library either way.
        console.warn('[push] registration failed', e)
      }
    })()

    return () => {
      cancelled = true
      // Drop the listeners so a re-run (or a user switch) doesn't stack them and
      // resolve a later registration against a stale user id.
      void PushNotifications.removeAllListeners()
    }
  }, [userId])
}

/**
 * Forget this device on sign-out, so the next person to use the phone doesn't
 * inherit the previous user's notifications. Best-effort: if it fails the token
 * is simply reassigned on the next sign-in.
 */
export async function unregisterDevice() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const token = await new Promise<string | null>((resolve) => {
      let settled = false
      const done = (v: string | null) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      void PushNotifications.addListener('registration', (t) => done(t.value))
      void PushNotifications.addListener('registrationError', () => done(null))
      void PushNotifications.register()
      setTimeout(() => done(null), 5_000)
    })
    if (token) await supabase.from('device_tokens').delete().eq('token', token)
  } catch {
    /* best effort — the token gets reassigned on the next sign-in anyway */
  } finally {
    void PushNotifications.removeAllListeners()
  }
}
