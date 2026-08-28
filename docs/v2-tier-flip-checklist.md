# v2 free-tier flip: 20/5 -> 10/3

Owner ruling 2026-08-27. **Every item below ships in ONE batch at v2 submission.**
Flipping the server alone would leave the live App Store listing quoting numbers
the app no longer honours.

## The five places the numbers live

| # | Where | Current | Becomes | How |
|---|---|---|---|---|
| 1 | `plan_limits()` SQL (Supabase, project `dilla`) | `imports 20, video 5` | `imports 10, video 3` | migration |
| 2 | `netlify/functions/_lib/usage.mjs` — `PLANS.free` | `{imports: 20, video: 5}` | `{imports: 10, video: 3}` | deploy |
| 3 | App Store description (§3 of app-store-submission.md) | "Save up to 20 recipes a month free" | "Save up to 10 recipes a month free" | OWNER, with the version submission |
| 4 | `src/pages/Landing.tsx` pricing block | "20 recipe imports a month / Including 5 video extractions" | 10 / 3 | deploy |
| 5 | `public/press/index.html` fact sheet | "Free: 20 imports/month (incl. 5 video)" | 10 / 3 | deploy |

Keep 1 and 2 identical — `plan_limits()` is the enforcement, `PLANS` mirrors it
for the API's messages, and a mismatch shows the user one number while enforcing
another.

## Order on the day

1. Owner edits the App Store description as part of the v2 version.
2. Apply the SQL migration + deploy the web changes (2, 4, 5) together.
3. Submit v2. Live listing and live app now agree.

## After it ships

- Watch the first reviews for "only 10 free" complaints. The value is
  server-side: a revert is a migration + deploy, minutes not days.
- Pull the p90 of monthly imports once there is real usage — that number tells
  us whether 10 bites at the right point or too early.
- Free-user cost ceiling drops ~$1.00 -> ~$0.45/month.

## Not changing

- Pro stays 200/40 at $4.99/$29.99 (the price change is a separate v2 decision).
- Manual recipe entry stays unmetered — typing costs us nothing.
- Editing stays free.

## Privacy policy — the anonymous-account upgrade (ships WITH the v2 binary)

`public/privacy/index.html` currently reads, deliberately neutral so it is true
both before and after v2:

> **Your account** — an account identified by a random ID, plus your email
> address and password (stored only in securely hashed form by our database
> provider) if you sign up with them.

Once the v2 binary is LIVE on the App Store (not at submission — at release),
upgrade it to the affirmative claim, which is a genuinely strong privacy
position and only becomes true then:

> **Your account** — you can use Dilla without telling us anything about
> yourself: tapping "Start cooking" creates an account identified only by a
> random ID, with no email and no password. Add an email later and we store it
> along with a securely hashed password, so your library survives a new phone
> and a subscription can be restored.

Bump the "Effective" date in the same edit. Do NOT make this change earlier:
until the binary ships, it would describe a flow users cannot reach — the same
error marketing corrected in the published GTM plan (D-065).
