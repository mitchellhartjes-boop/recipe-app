import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'
import { ensureShareKey } from './shareKey'

// TEMPORARY on-device diagnostics — the registration path fails silently on the
// phone and the WebView console can't be read from Windows. Best-effort; never
// throws. Remove once push registration is confirmed working.
async function dbg(step: string, detail?: unknown) {
  try {
    await supabase.from('push_debug').insert({ step, detail: detail == null ? null : String(detail).slice(0, 500) })
  } catch {
    /* diagnostics must never affect the flow */
  }
}

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
  // Gate on checkPermissions, NOT requestPermissions. The AppDelegate can grant
  // PROVISIONAL authorization (quiet notifications, no prompt) — and while
  // checkPermissions maps provisional to 'granted', requestPermissions re-asks
  // for full authorization and reports the still-provisional state as NOT
  // granted, which made this bail before ever calling register(): the device
  // token was never produced and the push had nothing to deliver to.
  let perm = await PushNotifications.checkPermissions()
  await dbg('perm-check', perm.receive)
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions()
    await dbg('perm-request', perm.receive)
  }
  // Register unless the user has explicitly said no. A provisional or full grant
  // is enough to obtain an APNs token — the token is about delivery capability,
  // separate from whether alerts are shown loudly.
  if (perm.receive === 'denied') return null

  // Resolve the token via the one-shot listener rather than a return value —
  // register() only kicks off APNs registration; the token arrives async. Attach
  // the listeners BEFORE register() so a fast token can't fire before we listen.
  const token = await new Promise<string | null>((resolve) => {
    let settled = false
    const done = (value: string | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    Promise.all([
      PushNotifications.addListener('registration', (t) => done(t.value)),
      PushNotifications.addListener('registrationError', () => done(null)),
    ])
      .then(() => PushNotifications.register())
      .catch(() => done(null))
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
    // Diagnostic: does the effect even reach here, and with what state? Runs
    // regardless of the guard below so a false isNativePlatform is visible.
    void dbg('effect', `native=${Capacitor.isNativePlatform()} userId=${userId ? 'set' : 'MISSING'}`)
    if (!Capacitor.isNativePlatform() || !userId) return
    let cancelled = false

    void (async () => {
      // Independent of push: the Share Extension needs this to import as the
      // right user, so it must not be skipped when notifications are declined.
      try {
        const key = await ensureShareKey(userId)
        await dbg('sharekey', key ? 'minted/ok' : 'returned null')
      } catch (e) {
        await dbg('sharekey-throw', e)
        console.warn('[shareKey] setup failed', e)
      }
      try {
        const token = await registerDevice(userId)
        await dbg('token', token ? 'got token' : 'no token')
        if (!cancelled && token) console.info('[push] registered')
      } catch (e) {
        // Never let a push failure break the app — it is an enhancement, and
        // the recipe still lands in the library either way.
        await dbg('token-throw', e)
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
