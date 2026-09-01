// Keep OUR error messages, replace everyone else's.
//
// Extraction failures reach the user in three places - the Add screen, the job
// card in the library, and a push notification. Several of those were passing
// the raw thrown message straight through, so on 2026-08-31 a billing problem
// on our side surfaced to a tester as:
//
//   "Your credit balance is too low to access the Anthropic API"
//
// That is our plumbing, described in our vendor's words, delivered to someone
// who just wanted a recipe. It also quietly tells every user which vendors we
// use and that we ran out of money.
//
// The messages we WRITE are good - "that site blocks apps from reading its
// pages", "this reel is audience-restricted" - and must survive. So this
// matches the signatures of vendor, billing, quota, key and transport errors
// and replaces only those. The real message still goes to the logs and to
// recipe_jobs.error, where it is useful and where no user reads it.

const VENDOR_NOISE = [
  /credit balance/i,
  /\bbilling\b/i,
  /\bquota\b/i,
  /rate.?limit/i,
  /\bapi key\b/i,
  /\bunauthorized\b/i,
  /\bauthentication\b/i,
  /\banthropic\b/i,
  /\bgroq\b/i,
  /\bapify\b/i,
  /\bopenai\b/i,
  /overloaded/i,
  /\b5\d{2}\b/, // bare 5xx
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i,
  /is not set$/i, // missing env var - a deployment problem, never the user's
]

/** True when the message describes OUR infrastructure rather than the user's request. */
export const isInfraError = (message) => VENDOR_NOISE.some((re) => re.test(String(message ?? '')))

/**
 * What the user should see. Infrastructure failures become one honest sentence
 * that also says the import wasn't counted - which is true, because both the
 * function and the worker refund on failure.
 */
export function friendlyError(message, fallback = 'Something went wrong reading that.') {
  const text = String(message ?? '').trim()
  if (!text) return fallback
  if (!isInfraError(text)) return text
  return "Dilla couldn't finish that one — a problem on our side, not yours. This didn't count against your monthly imports. Try again in a few minutes."
}
