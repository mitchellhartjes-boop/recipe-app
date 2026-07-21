import type { CapacitorConfig } from '@capacitor/cli'

// The native iOS shell around the Vite build (dist/).
//
// ⚠️ PLACEHOLDER BUNDLE ID. `com.mitchellhartjes.dilla` is a stand-in until the
// App Store name is settled. Changing it later means a new App ID + provisioning
// profile (and a second one for the share extension), so change it BEFORE the
// first App Store Connect record exists — after that it is effectively permanent.
const config: CapacitorConfig = {
  appId: 'com.mitchellhartjes.dilla',
  appName: 'Dilla',
  webDir: 'dist',
  backgroundColor: '#faf8f5',
  ios: {
    // "never": the app handles safe areas itself via CSS env(). "automatic"
    // double-applies the insets and leaves dead bands top and bottom.
    // Requires viewport-fit=cover in index.html (already set) or env() reads 0.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#faf8f5',
      showSpinner: false,
    },
  },
}

export default config
