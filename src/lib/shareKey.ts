import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'

// Bridge to the App Group container (see ios/App/App/SharedStorePlugin.swift).
// The Share Extension is a separate process and cannot see the WebView's
// storage, so this is the only way to hand it anything.
type SharedStore = {
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}
const SharedStore = registerPlugin<SharedStore>('SharedStore')

// The key the extension reads. Must match ShareViewController.swift.
export const SHARE_KEY_DEFAULTS_KEY = 'dilla-share-key'
// Local cache so a key is minted once per device, not once per launch.
const LOCAL_CACHE = 'dilla.shareKey'

type CachedKey = { key: string; userId: string }

function readCache(): CachedKey | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedKey
    return parsed?.key && parsed?.userId ? parsed : null
  } catch {
    return null
  }
}

/** 32 random bytes, url-safe. Generated on-device; the server never issues it. */
function mintKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Make sure this device has a share key belonging to `userId`, and that the
 * Share Extension can see it.
 *
 * Called on every launch: cheap when a key already exists, and it re-writes the
 * App Group value each time on purpose — reinstalls and iOS storage resets can
 * clear the container while localStorage survives, which would otherwise leave
 * the extension permanently unable to authenticate with no way to recover.
 */
export async function ensureShareKey(userId: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null

  const cached = readCache()
  // A key belongs to ONE account. If a different user signs in on this device,
  // the old key must not be reused — it would file their recipes under the
  // previous user.
  if (cached && cached.userId === userId) {
    const { data } = await supabase
      .from('share_keys')
      .select('key')
      .eq('key', cached.key)
      .is('revoked_at', null)
      .maybeSingle()
    if (data) {
      await writeToAppGroup(cached.key)
      return cached.key
    }
  }

  const key = mintKey()
  const { error } = await supabase.from('share_keys').insert({
    key,
    user_id: userId,
    device_label: navigator.userAgent.slice(0, 120),
  })
  if (error) {
    // TEMPORARY: surface the real insert error to the device diagnostics table.
    try {
      await supabase.from('push_debug').insert({ step: 'sharekey-insert-error', detail: String(error.message).slice(0, 500) })
    } catch {
      /* best effort */
    }
    console.warn('[shareKey] could not register key', error.message)
    return null
  }
  try {
    localStorage.setItem(LOCAL_CACHE, JSON.stringify({ key, userId } satisfies CachedKey))
  } catch {
    /* storage disabled — the key still works this session */
  }
  await writeToAppGroup(key)
  return key
}

async function writeToAppGroup(key: string) {
  try {
    await SharedStore.set({ key: SHARE_KEY_DEFAULTS_KEY, value: key })
  } catch (e) {
    console.warn('[shareKey] App Group write failed', e)
  }
}

/**
 * Revoke this device's key on sign-out and clear it from the App Group, so a
 * shared or resold phone cannot keep importing into the previous user's library.
 */
export async function clearShareKey() {
  if (!Capacitor.isNativePlatform()) return
  const cached = readCache()
  try {
    if (cached) {
      await supabase.from('share_keys').update({ revoked_at: new Date().toISOString() }).eq('key', cached.key)
    }
  } catch {
    /* best effort — the extension can no longer read it either way */
  }
  try {
    localStorage.removeItem(LOCAL_CACHE)
  } catch {
    /* ignore */
  }
  try {
    await SharedStore.remove({ key: SHARE_KEY_DEFAULTS_KEY })
  } catch {
    /* ignore */
  }
}
