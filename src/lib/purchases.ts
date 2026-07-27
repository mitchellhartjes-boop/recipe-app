import { Capacitor } from '@capacitor/core'
import { Purchases, LOG_LEVEL, type PurchasesPackage } from '@revenuecat/purchases-capacitor'

// RevenueCat wrapper. All of Dilla's subscription plumbing goes through here so
// the rest of the app never touches StoreKit concepts.
//
// The public SDK key is baked in at build time (VITE_REVENUECAT_APPLE_KEY, set
// in the Codemagic env group — it is a publishable key, safe in the bundle).
// When it's absent, everything no-ops and the paywall explains itself: the same
// ship-dark pattern as push, so the feature lights up when the key is added
// without a code change.
//
// The appUserID is the Supabase user id. That single line is what makes Pro
// follow the ACCOUNT — buy on your phone, signed in anywhere else, still Pro —
// and it's what the server webhook keys on to flip recipe_profiles.plan.
const API_KEY = (import.meta.env.VITE_REVENUECAT_APPLE_KEY as string | undefined) ?? ''

export const purchasesAvailable = () => Capacitor.isNativePlatform() && Boolean(API_KEY)

// Diagnostic trail for the paywall (revealed by triple-tapping the "plans
// aren't available" message). The WebView console can't be read from a Windows
// dev machine, so the reasons StoreKit/RevenueCat give for an empty offering
// have to surface in the UI itself.
const diag: string[] = []
const note = (s: string) => {
  diag.push(s)
  if (diag.length > 20) diag.shift()
}
const errText = (e: unknown) => {
  const err = e as { code?: string | number; message?: string; underlyingErrorMessage?: string }
  return [err?.code != null ? `code ${err.code}` : null, err?.message, err?.underlyingErrorMessage]
    .filter(Boolean)
    .join(' | ')
}
export const purchaseDiagnostics = () =>
  [`key: ${API_KEY ? `present (…${API_KEY.slice(-4)})` : 'MISSING FROM BUILD'}`, ...diag].join('\n')

let configuredFor: string | null = null

export async function configurePurchases(userId: string) {
  if (!purchasesAvailable() || configuredFor === userId) return
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN })
    await Purchases.configure({ apiKey: API_KEY, appUserID: userId })
    configuredFor = userId
    note(`configured for ${userId.slice(0, 8)}…`)
  } catch (e) {
    note(`configure FAILED: ${errText(e)}`)
    console.warn('[purchases] configure failed', e)
  }
}

export type ProOffering = {
  monthly: PurchasesPackage | null
  annual: PurchasesPackage | null
}

/** The current offering's monthly/annual packages, with localized price strings. */
export async function getProOffering(): Promise<ProOffering | null> {
  if (!purchasesAvailable()) return null
  try {
    const { current, all } = await Purchases.getOfferings()
    // The composition tells the story: no offerings at all = wrong key/project;
    // offering present but zero packages = StoreKit refused to serve the
    // products (agreement not active, or first-submission gate).
    note(
      `offerings: current=${current?.identifier ?? 'none'} all=[${Object.keys(all ?? {}).join(',') || 'empty'}] ` +
        `packages=${current?.availablePackages?.length ?? 0} monthly=${current?.monthly ? 'yes' : 'no'} annual=${current?.annual ? 'yes' : 'no'}`,
    )
    if (!current) return null
    return {
      monthly: current.monthly ?? null,
      annual: current.annual ?? null,
    }
  } catch (e) {
    note(`offerings FAILED: ${errText(e)}`)
    console.warn('[purchases] offerings failed', e)
    return null
  }
}

// Dilla has exactly one entitlement, so match ANY active one instead of a
// hardcoded identifier — the dashboard entitlement is named "Dilla Pro", and a
// string mismatch here would report a successful charge as a failure.
const anyActiveEntitlement = (customerInfo: { entitlements: { active: Record<string, unknown> } }) =>
  Object.keys(customerInfo.entitlements.active ?? {}).length > 0

/** True when the RevenueCat pro entitlement is active for this user. */
export async function hasProEntitlement(): Promise<boolean> {
  if (!purchasesAvailable()) return false
  try {
    const { customerInfo } = await Purchases.getCustomerInfo()
    return anyActiveEntitlement(customerInfo)
  } catch {
    return false
  }
}

/**
 * Run the purchase. Returns 'purchased' | 'cancelled' | 'failed'. The durable
 * plan flip happens server-side via the RevenueCat webhook (usually seconds);
 * the deny-path fallback in the import metering re-checks RevenueCat before
 * ever rejecting a fresh subscriber, so the tiny webhook race can't block them.
 */
export async function purchasePro(pkg: PurchasesPackage): Promise<'purchased' | 'cancelled' | 'failed'> {
  if (!purchasesAvailable()) return 'failed'
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
    return anyActiveEntitlement(customerInfo) ? 'purchased' : 'failed'
  } catch (e) {
    const err = e as { code?: string | number; userCancelled?: boolean; message?: string }
    if (err?.userCancelled || String(err?.code) === 'PURCHASE_CANCELLED') return 'cancelled'
    console.warn('[purchases] purchase failed', e)
    return 'failed'
  }
}

/** Apple-required: restore a previous purchase (new phone, reinstall). */
export async function restorePurchases(): Promise<boolean> {
  if (!purchasesAvailable()) return false
  try {
    const { customerInfo } = await Purchases.restorePurchases()
    return anyActiveEntitlement(customerInfo)
  } catch {
    return false
  }
}
