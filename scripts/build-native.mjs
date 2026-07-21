// Native (Capacitor) build: the same Vite app, built for the iOS shell.
//
// Two differences from the web build, both set here:
//   CAPACITOR_BUILD=1 -> vite.config.ts switches base to './' and drops the
//                        PWA service worker (see the comment there).
//   VITE_API_BASE     -> the native bundle has no serverless functions of its
//                        own, so /.netlify/functions/* calls must go to the
//                        deployed origin. src/lib/api.ts reads this.
import { execSync } from 'node:child_process'

const API_BASE = process.env.VITE_API_BASE || 'https://recipe-vault-mh.netlify.app'

if (!process.env.VITE_API_BASE) {
  console.log(`VITE_API_BASE not set — defaulting to ${API_BASE}`)
}

execSync('npx vite build', {
  stdio: 'inherit',
  env: { ...process.env, CAPACITOR_BUILD: '1', VITE_API_BASE: API_BASE },
})

console.log('\nNative build complete → dist/  (run `npx cap sync ios` next)')
