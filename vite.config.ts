import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run build:native` sets this. The native (Capacitor) build differs from
// the web build in two ways that both matter:
//   1. base './' — Capacitor serves the app from a custom scheme
//      (capacitor://localhost), where absolute '/assets/...' URLs don't resolve.
//   2. NO service worker — a Workbox SW inside a WKWebView is at best redundant
//      (the assets are already local) and at worst serves stale precached files
//      that `npx cap sync` cannot invalidate. Offline support in the native app
//      comes from the app's own caching, not from the PWA layer.
const isNative = process.env.CAPACITOR_BUILD === '1'

export default defineConfig({
  base: isNative ? './' : '/',
  plugins: [
    react(),
    ...(isNative
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
            manifest: {
              // `name` is the install prompt / listing name; `short_name` is what
              // fits under the home-screen icon.
              name: 'Dilla: Recipe Vault',
              short_name: 'Dilla',
              description: 'Dilla — your personal recipe vault. Every recipe you love, in one place.',
              theme_color: '#c2410c',
              background_color: '#faf8f5',
              display: 'standalone',
              orientation: 'portrait',
              start_url: '/',
              scope: '/',
              categories: ['food', 'lifestyle'],
              icons: [
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/\.netlify\//],
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              // Press-kit assets are multi-MB downloads for journalists — never
              // precache them into every visitor's service worker (they also
              // exceed workbox's 2MB per-file limit and fail the build).
              globIgnores: ['**/press/**'],
              // Cache the re-hosted recipe cover images (Supabase Storage) so the
              // library still shows pictures on a flaky kitchen connection.
              runtimeCaching: [
                {
                  urlPattern: ({ url }) =>
                    url.hostname.endsWith('supabase.co') && url.pathname.includes('/storage/'),
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'recipe-images',
                    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
              ],
            },
            // The service worker is a production concern; keep it out of `vite dev`
            // so it never interferes with hot-module reload.
            devOptions: { enabled: false },
          }),
        ]),
  ],
})
