import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

// Bridge to the native Discover browser (ios/App/App/DillaBrowserPlugin.swift):
// a full-screen WKWebView showing the platform's own site with a persistent
// "Save this recipe" bar. The platforms all send X-Frame-Options, so an iframe
// inside our WebView can never show them — a real native browser layer is the
// only way.
type SaveRequested = { url: string }

type DillaBrowserPlugin = {
  open(options: { url: string }): Promise<void>
  close(): Promise<void>
  addListener(event: 'saveRequested', cb: (data: SaveRequested) => void): Promise<PluginListenerHandle>
  addListener(event: 'browserClosed', cb: () => void): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

const DillaBrowser = registerPlugin<DillaBrowserPlugin>('DillaBrowser')

export const discoverBrowserAvailable = () => Capacitor.isNativePlatform()

/**
 * Open a URL in the Discover browser. On the web build (no native layer) the
 * page opens in a normal new tab instead — browsing still works, the in-place
 * save button is simply a native-only nicety.
 */
export async function openDiscoverBrowser(url: string): Promise<'native' | 'tab'> {
  if (!discoverBrowserAvailable()) {
    window.open(url, '_blank', 'noopener')
    return 'tab'
  }
  try {
    await DillaBrowser.open({ url })
    return 'native'
  } catch {
    window.open(url, '_blank', 'noopener')
    return 'tab'
  }
}

/** Listen for "Save this recipe" taps. Returns an unsubscribe function. */
export function onSaveRequested(cb: (url: string) => void): () => void {
  if (!discoverBrowserAvailable()) return () => {}
  const handle = DillaBrowser.addListener('saveRequested', (data) => {
    if (data?.url) cb(data.url)
  })
  return () => {
    void handle.then((h) => h.remove()).catch(() => {})
  }
}
