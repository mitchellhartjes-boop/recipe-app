import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractRecipe, createJob, apiUrl } from './api'

// Receives content shared into the app from iOS's share sheet (Instagram,
// Pinterest, Safari, Photos) via the native Share Extension, and routes it into
// the extraction the app already does.
//
// A shared LINK goes through /extract like the Add screen. A shared IMAGE goes
// through the vision path in /submit — which is the screenshot flow, and the one
// that works for reels no fetch can read.

export type ShareStatus =
  | { state: 'idle' }
  | { state: 'working'; what: string }
  | { state: 'done'; title: string; recipeId?: string }
  | { state: 'error'; message: string }

const FIRST_URL = /https?:\/\/[^\s"'<>]+/i

function firstUrl(texts: string[]): string | null {
  for (const t of texts) {
    const m = t.match(FIRST_URL)
    if (m) return m[0].replace(/[.,)\]}'"]+$/, '')
  }
  return null
}

// Instagram appends an `igsh=` share-tracking parameter that ties the share back
// to the sharing user's profile. The shortcode is the actual content id, so the
// parameter is stripped before the URL is stored or sent anywhere.
function stripTracking(url: string): string {
  try {
    const u = new URL(url)
    for (const p of ['igsh', 'igshid', 'utm_source', 'utm_medium', 'utm_campaign', 'si']) {
      u.searchParams.delete(p)
    }
    return u.toString().replace(/\?$/, '')
  } catch {
    return url
  }
}

async function fileToBase64(uri: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(uri)
    const blob = await res.blob()
    const base64: string = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
    return { base64, mediaType: blob.type || 'image/jpeg' }
  } catch {
    return null
  }
}

export function useSharedContent() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<ShareStatus>({ state: 'idle' })
  // Guards against the same payload being handled twice — the plugin can emit
  // on both cold start and resume.
  const handled = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function handle(payload: { texts?: string[]; files?: { uri: string; mimeType: string }[] }) {
      const texts = payload.texts ?? []
      const files = payload.files ?? []
      const key = JSON.stringify([texts, files.map((f) => f.uri)])
      if (handled.current === key) return
      handled.current = key

      // Prefer an image when one is present: a shared screenshot is the whole
      // point of that path, and it works when a link would not.
      const image = files.find((f) => f.mimeType?.startsWith('image/'))
      if (image) {
        setStatus({ state: 'working', what: 'Reading your screenshot…' })
        const data = await fileToBase64(image.uri)
        if (!data) return setStatus({ state: 'error', message: "Couldn't read that image." })
        try {
          const res = await fetch(apiUrl('/.netlify/functions/submit'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: data.base64, type: data.mediaType }),
          })
          const body = await res.json()
          if (cancelled) return
          if (body.ok) {
            setStatus({ state: 'done', title: body.title, recipeId: body.recipe_id })
            if (body.recipe_id) navigate(`/recipe/${body.recipe_id}`)
          } else {
            setStatus({ state: 'error', message: body.message ?? "Couldn't find a recipe in that image." })
          }
        } catch {
          if (!cancelled) setStatus({ state: 'error', message: 'Something went wrong reading that image.' })
        }
        return
      }

      const raw = firstUrl(texts)
      if (!raw) return setStatus({ state: 'error', message: 'Nothing to import from that share.' })
      const link = stripTracking(raw)

      setStatus({ state: 'working', what: 'Reading the recipe…' })
      try {
        const result = await extractRecipe(link)
        if (cancelled) return
        if (result.ok) {
          // Straight to the review screen, same as the Add flow.
          navigate('/review', { state: { draft: result.recipe, banner: null } })
          setStatus({ state: 'idle' })
          return
        }
        if (result.reason === 'video_only') {
          await createJob(link, 'video', {})
          navigate('/', { state: { queued: 'video' } })
          setStatus({ state: 'idle' })
          return
        }
        navigate('/review', { state: { draft: result.draft, banner: { kind: 'info', text: result.message } } })
        setStatus({ state: 'idle' })
      } catch (e) {
        if (!cancelled) {
          setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Could not read that link.' })
        }
      }
    }

    async function wire(): Promise<(() => void) | undefined> {
      // Native-only: the web build has no share target, and the dynamic import
      // keeps the plugin out of the web bundle's critical path.
      try {
        const { CapacitorShareTarget } = await import('@capgo/capacitor-share-target')
        if (!CapacitorShareTarget?.addListener) return undefined
        const sub = await CapacitorShareTarget.addListener('shareReceived', (event) => {
          void handle({ texts: event.texts, files: event.files })
        })
        return () => void sub.remove()
      } catch {
        return undefined
      }
    }

    const cleanup = wire()
    return () => {
      cancelled = true
      void cleanup.then((fn) => fn?.())
    }
  }, [navigate])

  return { status, dismiss: () => setStatus({ state: 'idle' }) }
}
