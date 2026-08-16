# Feature request: in-app review prompt at the "just cooked it" moment

**From:** Marketing · **Priority:** HIGH — this is the ratings engine; every organic channel converts better with volume + stars behind it. Small, ship before or shortly after loud launch (Wed Aug 27 target).

## Behavior

Request an App Store review via the native `SKStoreReviewController` / Capacitor equivalent (system sheet, in-app, no redirect) when the user hits a genuine success-glow moment:

**Trigger A (primary):** user completes their **2nd Cook Mode session** (reaches the final step). Fire on the completion screen, after a ~2s beat — not instantly on tap.
**Trigger B (fallback):** user completes their **10th successful import** and Trigger A hasn't fired yet. Fire when they OPEN that imported recipe (in-app moment), never off the push notification itself.

## Guards (all must pass)

- ≥3 days since first launch.
- No import errors and no paywall-hit in the current session (never prompt someone mid-frustration).
- Never during onboarding, never within an active Cook Mode session (only the completion moment).
- Max once per app version; respect Apple's system-level 3-per-365-days cap (the API self-limits, but don't burn attempts: once either trigger fires, set a flag and stop evaluating until next version).
- If the system sheet doesn't appear (Apple throttled it), do nothing — no custom "rate us" fallback UI.

## Implementation notes

- Local flags only (UserDefaults/local store): `cookModeCompletions`, `successfulImports`, `firstLaunchDate`, `promptedOnVersion`. No server calls, no analytics events — consistent with the no-tracking promise.
- Compliance: native prompt only, no pre-prompt "enjoying Dilla?" gate (Apple now rejects sentiment-gating), no copy changes to the system sheet.

## Also in this ticket (2 lines, marketing needs it weekly)

A SQL snippet Mitch can run (or a tiny internal count surfaced anywhere) for **aggregate successful imports per week** — total count only, no per-user anything. It's the marketing north-star metric.
