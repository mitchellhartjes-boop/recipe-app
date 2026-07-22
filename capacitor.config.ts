import type { CapacitorConfig } from '@capacitor/cli'

// The native iOS shell around the Vite build (dist/).
//
// Name settled 2026-07-21: the App Store listing is "Dilla: Recipe Vault" (the
// keyword half carries ASO — nobody finds a recipe app by searching its brand).
// `appName` here is the SHORT home-screen name, which must stay under ~12 chars
// or iOS truncates it under the icon.
//
// The bundle id is final. Changing it after the App Store Connect record exists
// means a new App ID + provisioning profiles (two, once the share extension
// lands), so it is effectively permanent from here.
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
    // MUST match the App Group on both targets and the appGroupId in
    // ShareViewController.swift. Without this the plugin falls back to
    // "group.YOUR_APP_GROUP_ID" and reads an empty container — the app opens
    // from the share sheet and nothing ever arrives.
    CapacitorShareTarget: {
      appGroupId: 'group.com.mitchellhartjes.dilla',
    },
  },
}

export default config
