import { useEffect, useRef } from 'react'

type Sentinel = { release: () => Promise<void> }

/**
 * Holds a screen wake-lock while `active`, so the phone doesn't dim mid-cook.
 *
 * Two things make this fiddly enough to be worth sharing between Cook Mode and
 * the recipe page: the OS silently drops the lock whenever the page is hidden
 * (so it has to be re-acquired on the way back), and requesting one while the
 * document is hidden throws — hence the visibility guard in acquire().
 *
 * Unsupported or denied is a non-event: the screen just behaves normally.
 */
export function useWakeLock(active = true) {
  const ref = useRef<Sentinel | null>(null)

  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<Sentinel> }
    }
    if (!nav.wakeLock) return
    let cancelled = false

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible' || ref.current) return
      try {
        ref.current = (await nav.wakeLock!.request('screen')) ?? null
        if (cancelled) {
          void ref.current?.release().catch(() => {})
          ref.current = null
        }
      } catch {
        /* unsupported, denied, or not user-activated — cooking still works */
      }
    }

    void acquire()
    const onVisible = () => {
      // The lock is gone once hidden; clear our stale handle before re-asking.
      if (document.visibilityState === 'visible') {
        ref.current = null
        void acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void ref.current?.release().catch(() => {})
      ref.current = null
    }
  }, [active])
}
