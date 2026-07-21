# Dilla → App Store: Decision-Grade Strategy

*Synthesis of 6 research tracks + adversarial verification. Prepared 2026-07-21.*
*Where verification corrected a research claim, the corrected version is used and flagged as **[CORRECTED]**.*

---

## ⚠️ Do this before you read the rest (30 minutes, today)

`C:\Users\MHARTJES\recipe-app\netlify\functions\extract.mjs` is **live in production, unauthenticated, with `Access-Control-Allow-Origin: '*'`, and it spends your Anthropic key.** Anyone who finds the URL can run an unbounded bill. `submit.mjs` is only marginally better — it's gated by a single `SHORTCUT_TOKEN` bearer secret that ships *inside the iOS Shortcut file you distribute*, so it is extractable by anyone who has the Shortcut.

1. Set a hard monthly spend cap on the Anthropic API key in the console.
2. Set a spend alert on Apify and Groq.

This is not a launch concern. It's a live exposure that exists right now, independent of every decision below.

---

## 1. Verdict

**GO — with four hard conditions.** Ship it. But ship a *different product than the one you have*, under a different name, with a paid tier from day one, and only if you accept the realistic outcome.

**Condition 1 — Strip the two indefensible lines before submitting.** The Googlebot user-agent spoof against `instagram.com/reel/{code}/embed/captioned/` and the Apify `instagram~instagram-scraper` video download. These are the entire difference between "an app that processes what a user shares it" and "an app that scrapes Instagram." They are what got The OG App (Sept 2022) and Wrapped (Nov 2023) pulled from the App Store — in both cases Meta filed a complaint and Apple removed the app within days, with no meaningful appeal.

**Condition 2 — Ship paid, not free.** The Sounder playbook ("v1 free, no IAP, add Pro later") is **the wrong call here and you should consciously break from it.** Sounder's marginal cost per user is approximately zero. Dilla's is not — every import spends real money at Anthropic, Groq, and Apify. A free Dilla with no IAP is a direct subsidy of every user's inference bill, and the heaviest users cost the most. This is the single biggest divergence from your proven playbook.

**Condition 3 — Retire the name "Dilla" before you create an App Store Connect record.** It's ASO-invisible behind J Dilla the musician, an app literally titled "DILLA" is already live (id1644111197), and "Dillas Quesadillas" is an operating US food chain with its own App Store app — a food-sector mark against a food app derived from *quesadilla*. Renaming after launch destroys accumulated ratings and ASO.

**Condition 4 — Compete on the cook-side, not the import-side.** "Import from Instagram" is shipped by ~39 apps including a category leader with 262,000 ratings. You will lose that comparison in App Store search on day one.

**Three reasons this is a "go" and not a "no":**

1. **Demand is proven, not speculative.** ReciMe went from $24/week to $68,200/week revenue on **US Android alone** between late June and late September 2025 (Sensor Tower Q3 2025), on the exact feature you already have working. In that same quarter it out-earned NYT Cooking on Android US. The question was never "will people pay for this."
2. **The thing that would kill you is two lines of code and one storage behavior, all removable at near-zero cost.** The UA spoof, the Apify dependency, and re-hosting creators' cover photos to Supabase Storage. Delete all three and you go from "one Meta complaint away from removal, plus a §106 copyright claim on every recipe" to "a normal app." That is an extraordinarily cheap risk reduction.
3. **Your unit economics work after roughly one day of engineering.** Blended cost per import drops from ~$0.022 to ~$0.0125 with four changes, none of which alter product behavior. At $39.99/yr that supports **224 imports per month per subscriber at break-even** — far above what any real human does.

**What "go" honestly means:** the median subscription app makes ~$72/month twelve months after launch. Only 17.3% ever reach $1K MRR; 4.6% reach $10K (RevenueCat, 115K apps). At a realistic 2.5% conversion on $39.99/yr, Dilla nets ~$78/mo at 1,000 installs, ~$780/mo at 10,000, ~$7,800/mo at 100,000. **The product and the pricing are not the constraint. Distribution is.** Treat v1 as a well-monetized personal app that is architecturally ready to scale, and make the go/no-go on *further* investment against install growth, not revenue.

---

## 2. The market & the competition

### Demand: settled

| Signal | Value | Source quality |
|---|---|---|
| ReciMe weekly revenue, US Android | $24 (late Jun 2025) → **$68,200** (late Sep 2025) | High — Sensor Tower |
| ReciMe weekly downloads, US Android | 3,900 → 76,800 in one quarter | High |
| ReciMe App Store rating | 4.8★ / **262,000** ratings, #11 US Food & Drink | High — verified listing |
| Food save rate on Reels | 8–15% of plays vs 1–3% Reels baseline | Medium — agency blogs, not platform data |
| TikTok videos still accessible at 12 months | **64%** (36% gone) — your saves rot | Medium — secondhand citation |

### The field — name by name

| App | Model & price | Social import | Notable |
|---|---|---|---|
| **ReciMe** | Free + $39.99–59.99/yr; free tier 5 imports/wk | Caption → audio → source site | 4.8★/262K. ~$2M raised (Marissa Mayer, Deb Liu, Karl von Randow). **Failed an ASMR potato-soup reel outright** in Android Police testing |
| **Pestle** | Free + $2.99/mo, $24.99/yr, ~$39.99–49.99 lifetime | **Caption text only** — on-device ML, 0.1s | Architecturally cannot read a video. 4.7★/1.8K. Apple-only |
| **Mela** | **$6.99 one-time** | Scrapes video *description*, no AI at all | 4.7★/847. Last shipped 06/08/2025 — over a year stale |
| **Paprika** | **$4.99 one-time** per platform | **None at all** | 4.9★/**53,000** — most-loved in the category. Maintenance mode since ~Sept 2023. **The largest pool of switchers in the market** |
| **Crouton** | Free + $24.99 lifetime, Discover $14.99/yr | OCR/cookbook scan | 2024 Apple Design Award. **[CORRECTED]** — see below |
| **Samsung Food** | **Free**, ~6M users | Yes | Samsung's balance sheet, giving it away |
| **Cookpad** | **Free**, ~100M users | "One tap" from IG/TikTok | Sets the price floor at zero |
| **Flavorish / Stashcook / Recify / Pluck / Deglaze / FoodiePrep / Honeydew** + ~30 more | $2.99–11.99/mo, $24.99–49.99/yr, some lifetime | Yes, all of them | Pluck meters extractions at 10/50/200 per month — hard evidence per-import COGS is material |

**[CORRECTED] Crouton was NOT removed from the App Store.** Multiple "best recipe apps 2026" blogs (fond.kitchen, trymise.app) state it "was removed on January 12, 2026." The live listing was verified directly: version 2026.1.2, shipped 6 days before checking, actively selling Crouton Plus at $24.99. **Do not plan around a vacancy that does not exist.** More importantly: a large share of top-ranking "best recipe app" content in 2026 is AI-generated SEO published by rival apps and contains outright fabrications. Re-verify the field yourself against primary sources (App Store listings, developer sites, TechCrunch/MacStories/Android Police) immediately before launch.

**[CORRECTED] ReciMe's user count is contested.** Marketing claims 10M users. Tracxn puts it at ~800,000 with ~$2.05M annual revenue and 31 employees. Google Play shows 1M+ installs. The App Store ratings count (262K) is the only hard number. Use "~800K–1M verified, 10M claimed" — planning against a 10M figure overstates the moat, and $2.05M ÷ 31 people is not a fortress.

### How contested is "import from Instagram"?

Total commoditization. At minimum 9 established apps and 25+ AI-first entrants ship it. App Store IDs prove the recency of the flood: Recipedia (id6759192988), Shoyu (id6759294167), Feedr (id6757105458), Cooked (id6756487375), Recipool (id6755876823), Chefbooks (id6752548513), Recimarry (id6747362878), Seasoned (id6745625936), MealFlow AI (id6745305199), All My Meals (id6742485790) — all 2025–2026 vintage. Android Police's tester wrote that ReciMe, Stashcook, and Recify "were so alike in their setup procedure that I thought I had time-traveled back five minutes."

**If you pitch Dilla on "saves recipes from Instagram," you are pitching a worse-funded ReciMe.**

---

## 3. Dilla's real differentiators — ruthless triage

| Asset | Verdict | Why |
|---|---|---|
| Instagram/TikTok reel import | **Table stakes** | ~39 apps. The single most crowded feature in the category. |
| Full multimodal video extraction (Whisper + vision on frames) | **Real but narrow edge** | Pluck, Deglaze, FoodiePrep, and ReciMe all advertise the same three-stage pipeline. **BUT** ReciMe demonstrably fails at it (failed an ASMR reel outright; missed a visible potato-adding step), and Pestle/Mela are structurally incapable. The claim that survives: *"works even when the recipe is never written down."* |
| **Screenshot import** | **[CORRECTED] NOT the moat you think** | You believe this beats age-gated and audience-restricted reels that no competitor can touch. **ReciMe's own public help doc instructs its users to do exactly this**: "Take a screenshot of the recipe and import it as an image." CookBook, My Recipe Book, Inspo, and Flavorish all ship photo/camera import. It remains your most **legally durable** path (see §4) — it just isn't a competitive differentiator. Reposition it as *safety and reliability*, not as *exclusivity*. |
| Cook mode + servings scaler + ingredient sections | **Real edge — the best one you have** | Pestle ships a step-by-step cook mode, so the *feature* is table stakes. But execution quality is genuinely weakly defended: Paprika (4.9★, 53K) has no social import and is stagnant; Mela has no AI and last shipped June 2025; Crouton is Apple-ecosystem-locked. Meanwhile ReciMe draws UX complaints — cookbook scrolling described as "a nightmare. Everywhere you click on the screen is a touch spot." **Nobody currently holds Crouton-grade craft plus ReciMe-grade ingestion.** |
| Auto-categorization / smart collections | **Table stakes, low perceived value** | No competitor markets on it. |
| Pexels stock-photo fallback | **Actively harmful — kill it** | Attaching a stock photo of a *different dish* to a saved recipe is quietly deceptive. The moment a user cooks it and it looks nothing like the picture, credibility is spent. No competitor does this, and this is probably why. It is also the exact "Frankenstein recipe" pattern (AI merging sources while attaching someone's imagery) that food creators are publicly angry about. **Replace with the designed gradient + category emoji card**, which you already have and which is the better answer. |
| **Post-cook behavioural data** | **The moat nobody is building** | Every competitor competes on *capture*. Capture data is worthless as a moat — a user can re-import their whole library into a rival in an afternoon. You already collect star ratings, cook-mode completions, servings scale factors, checked ingredients, and planner slots. Together that's a record of what was **actually cooked**, at what serving size, how often, and how it rated. **That cannot be re-imported from Instagram, and it compounds monthly.** It is unmarketed and unexploited today. This is the direct analogue of Sounder's "it learns YOUR patterns" moat. |

**The honest ranking:** one genuine long-term moat (cook history), one real near-term wedge (craft in the cooking moment), one real-but-narrow technical claim (caption-less video), one legal safety valve mislabeled as a moat (screenshot), and one feature to delete (stock photos).

---

## 4. The legal & policy minefield

**This is the section that can kill the project.** It is also the cheapest section to fix.

### 4.1 Guideline 5.2.2 — the existential one

Verbatim, from Apple's live guidelines:

> **5.2.2 Third-Party Sites/Services:** If your app uses, accesses, monetizes access to, or displays content from a third-party service, ensure that you are specifically permitted to do so under the service's terms of use. **Authorization must be provided upon request.**

Instagram's Terms of Use, verbatim:

> You may not access or collect data from our Products using automated means (without our prior permission).

Apple does not adjudicate this. It asks you to produce documentation — a license, contract, public API terms, or partner approval. **You cannot produce any such document for Instagram**, because `/embed/captioned/` is undocumented and Apify is an unauthorized third-party scraper. Apple's own warning: submitting falsified documentation "can result in the termination of your Apple Developer Program account."

**Guideline 5.2.3** is even more directly on point for the video path:

> Apps should not facilitate illegal file sharing or include the ability to save, convert, or **download media from third-party sources** (e.g. Apple Music, YouTube, SoundCloud, Vimeo, etc.) without explicit authorization from those sources.

Your worker downloads a reel's MP4 via Apify and runs ffmpeg over it. That is literally downloading media from a third-party source without authorization.

**Precedent, both real:**
- **The OG App** (Sept 2022) — ad-free Instagram client, ~10K downloads in days. Apple pulled it citing **section 5.2.2** for "accessing Instagram's service in an unauthorized manner," after a Meta complaint. Meta also disabled the founders' personal accounts. Google removed it ~11 days later.
- **Wrapped** (Nov 2023) — Instagram analytics app, removed within ~2 months of launch. Meta: "This app violates our policies and we've asked Apple to remove it." Apple complied. Meta declined to say which policy.

**[CORRECTED] The civil-law picture is much more permissive than the App Store picture, and this distinction matters.** In *Meta Platforms v. Bright Data* (N.D. Cal., Jan 23 2024), Judge Chen granted summary judgment for Bright Data, holding Meta's terms govern "your use" and that "Bright Data did not 'use' Facebook and Instagram when it engaged in public logged-off scraping." Meta dismissed the remaining claim in Feb 2024 and waived appeal. **But this is a contract-law ruling with zero binding effect on App Review.** Apple enforces 5.2.2 as private platform policy and defers to Meta's complaint regardless of who would win in court. Do not let "scraping public data is legal" lull you — **the operative risk is not a lawsuit, it is a removal email.**

**The Googlebot UA spoof is the single most indefensible line of code in the product.** Bright Data's win rested on plain, honest, logged-off retrieval. Spoofing Googlebot to obtain content Instagram serves *selectively to search crawlers* is qualitatively different — it is impersonation to defeat a server-side access decision. Google publishes reverse-DNS verification precisely so sites can detect fake Googlebots. Practically: you cannot describe this technique in an App Review Information note without inviting a 5.2.2 rejection, and you cannot hide it if Meta ever inspects your traffic.

**Do this instead:**

| Remove | Replace with |
|---|---|
| Googlebot UA spoof on `/embed/captioned/` | A **single, honest, logged-out fetch** with your own identifying user agent (`DillaBot/1.0 (+https://yoursite/bot)`), one per explicit user action, at human rates. This is the exact posture Judge Chen blessed. Put it behind a **server-side feature flag** so a platform complaint is a config change, not a resubmission. |
| Apify video download in the shipped iOS build | Ship v1 with the video path **disabled or paid-tier-only**. Caption + website + screenshot cover the large majority of content. If you keep it, never persist reel video bytes (they're already transient in `worker/lib/video.mjs` — keep it that way and say so in review notes). |
| Nothing — *add* this | Evaluate **Meta's tokenless oEmbed** (reportedly available without an access token and without App Review since ~June 15 2026). It won't give you the caption, but it gives you **one documented, permitted Meta endpoint you can name by name in your App Review notes** — which is exactly what 5.2.2 asks for. ⚠️ Verify this from Meta's own developer changelog before relying on it; it was confirmed only from secondary sources. |

### 4.2 Copyright — the recipe is safe, the photo is not

*Publications International, Ltd. v. Meredith Corp.*, 88 F.3d 473 (7th Cir. 1996) is controlling US authority: an ingredient list is "a statement of facts devoid of any protectable expressive element" and "cannot be considered original within the meaning of the Copyright Act." Directions are excluded under §102(b) as an unprotectable process.

**What IS protected:** headnotes, introductions, personal stories, descriptive variations — and **photographs, fully and squarely.**

Dilla downloads a creator's photo and stores a verbatim, full-resolution copy on its own server for commercial display. That is textbook §106(1) reproduction plus §106(5) display. Fair use is weak on factor 1 (non-transformative, verbatim), factor 3 (the entire work), and factor 4 (direct market substitution — it replaces the visit to the creator's post). **DMCA §512(c) safe harbor probably does not cover it**, because the copy is made by your pipeline, not stored "at the direction of a user."

**Do this instead — reorder the cover pipeline:**
1. User's own photo (best — and it feeds the cook-log moat, see §7)
2. Designed gradient + category emoji card *(promote from last resort to default)*
3. **Delete** the Pexels stock fetch entirely
4. If you keep *any* third-party image: small thumbnail only, with visible creator handle and a tappable link to the original post

Also: register a DMCA agent with the US Copyright Office (**~$6 filing**), publish a takedown email, and build a one-command purge for a given source handle or URL so you can comply in minutes. It's cheap and it's a good-faith signal even if it isn't a shield.

### 4.3 Creator backlash — the Recipeasly risk

Recipeasly launched ~March 1 2021 marketing itself as recipes "without the ads or life stories." Food-blogger outrage buried it and the founder took the site down **the same week**. No lawsuit was ever needed.

Creators are markedly more hostile in 2026 than 2021: AI bot traffic rose ~225% during 2025; Carrie Forrest of Clean Eating Kitchen reports losing "80 percent of her traffic and revenue in two years"; AI Overviews cut CTR for top-ranking pages by 34.5% across a 300K-keyword study.

**Do this instead:**
- Creator handle + avatar + tappable link to the original reel on **every recipe card and at the top of cook mode**, permanently and non-removably. Make attribution a designed feature, not a footnote.
- **Never** use the phrases "without the ads" or "skip the life story." That framing, not the technology, is what killed Recipeasly in under a day.
- Position it as *"a personal cookbook that remembers where you found each recipe and sends you back to the creator."*
- Ship v1 with imported recipes **private by default and no public sharing surface** — this removes the market-substitution fair-use factor almost entirely.
- Add a one-tap "report / remove this recipe" path a creator can invoke.

### 4.4 The rest of the App Review surface

| Guideline | Risk | Fix |
|---|---|---|
| **4.3(b)** (updated June 2026): *"Don't submit apps that are indistinguishable from what's already widely available"* + oversaturated-category removal language | **High.** You are a Capacitor webview wrapper entering the most gold-rushed sub-category of 2026 alongside ~39 near-identical apps. This is now a *post-approval removal* risk, not just first-review. | Lead the listing, screenshots, and reviewer notes with **cook mode**, not importing. Ship native surface area (Share Extension, widget, haptics, wake-lock). Write explicit reviewer notes naming what's meaningfully different. |
| **4.2 / 4.2.2** (repackaged website / content aggregator) | **Low.** Cook mode with wake-lock, servings scaler, sectioned ingredients, grocery list, meal planner are exactly the original stateful functionality that clears 4.2. Apple doesn't reject apps for using Capacitor; it rejects apps that read as a URL in a box. | Offline-readable vault (a saved recipe must open with airplane mode on), designed offline state that is never a Safari error page, no browser chrome, **This Week's Meals widget**. |
| **4.2.3(i)**: *"Your app should work on its own without requiring installation of another app"* | **Medium.** Your primary ingestion path currently requires the user to manually install an iOS Shortcut. That's the exact dependency 4.2.3(i) describes — and a brutal onboarding step for a paying stranger. | Native iOS **Share Extension**. Both Pestle and ReciMe appear in Instagram's native "Share to" list; that's the product-quality bar, not just the compliance bar. |
| **5.1.2(i)** — updated **Nov 13 2025**, effective immediately, penalty is removal | **High and trivially easy to forget.** You must "clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so." | First-run consent sheet, shown **before the first extraction call**, naming **Anthropic (Claude), Groq (Whisper), Apify, Pexels** by name, stating what is sent and why. Mirror it in the Privacy Nutrition Label and a privacy policy at a stable URL. Keep it revocable in Settings. |
| **5.1.1(v)** — account deletion | Medium; one of the most common current rejection causes. | Only bites once you add accounts. Then: Settings → Delete Account, in two taps, with real server-side cascade across `recipe_recipes`, `recipe_jobs`, grocery, meal plan, **and Supabase Storage objects** (orphaned covers otherwise bill forever). |
| **4.8** — Sign in with Apple | **[CORRECTED] Probably does not apply to you.** The guideline requires an equivalent option only for apps using *third-party or social* login (Facebook, Google, etc.), with an explicit carve-out: *"Another login service is not required if your app exclusively uses your company's own account setup and sign-in systems."* Supabase email magic link counts as your own system. | **Ship email magic link only, no Google/Facebook.** This removes the Sign in with Apple obligation entirely and is the simpler v1. If you *do* add Sign in with Apple, deletion must additionally call Apple's REST token-revocation endpoint or review fails. |
| **Age rating** (new questionnaire mandatory since Jan 31 2026) | Low. Two triggers: the cocktails/Drinks collection (alcohol references) and Claude-generated recipe text (model-generated content). | Answer honestly, flag infrequent/mild alcohol, accept the bump. The risk is answering carelessly — that's a metadata rejection. Confirm the questionnaire is complete in App Store Connect before submitting. |
| **Content Dispute form** | Medium. Any single creator (not just Meta) can file. Apple contacts you, and *"if the developer does not take sufficient action or fails to respond, Apple will remove the infringing app"* — commonly within **3–5 days**. | Publish a monitored support email + DMCA agent before submitting. Pre-write a response template. Not re-hosting photos removes most of the surface. |

### 4.5 The one-paragraph test

Before submitting, write a plain-English description of **every** ingestion path and paste it into App Review Information. State that the app processes content the **user explicitly shares to it from their own device**, performs no crawling or bulk collection, stores no Instagram credentials, and links back to the original post. **Never claim a partnership or authorization you don't have.**

> **If you cannot describe a path to a reviewer without embarrassment, that path should not be in the shipped build.**

---

## 5. Engineering plan

**Total: 9–12 weeks of solo work with an AI pair programmer, plus a realistic 2–4 week buffer for one or two review rejections. Treat the first rejection as expected, not exceptional.**

**Sequence matters:** resolve the business model and legal framing *before* writing multi-tenancy code. Both determine the quota architecture. Building auth first and discovering later that the video path must be paywalled means reworking the quota layer.

### Phase 0 — Decide & de-risk (1 week, mostly not code)

- Anthropic/Apify/Groq spend caps (today, see top of doc).
- Lock the v1 path mix. **Recommended: caption (honest UA, flagged) + website + screenshot ON; video/Apify OFF or paid-tier-only.**
- Lock free-tier bound and price (see §6).
- Lock the name (see §7) — before any App Store Connect record exists.
- Confirm Sounder's `codemagic.yaml` already satisfies **Xcode 26 / iOS 26 SDK** (mandatory for all App Store Connect submissions since April 28, 2026) and **Capacitor 8's floors: Xcode 26+, iOS deployment target 15.0 (including `ios/App/Podfile`), Node 22+**.
- Register the DMCA agent (~$6). Stand up the privacy policy + ToS URLs.

### Phase 1 — Multi-tenancy (3 weeks)

The hard part isn't client auth — it's that **both `netlify/functions/submit.mjs` and `worker/index.mjs` authenticate as one hardcoded human** via `supabase.auth.signInWithPassword({email: APP_EMAIL, password: APP_PASSWORD})` on *every request*, then rely on `auth.uid()` column defaults to scope inserts. That per-request password sign-in also adds a Supabase auth round-trip to every extraction and will hit Supabase's auth rate limits well before you hit any AI limit.

1. **Auth:** Supabase email magic link as the *only* provider (see 4.8 above). Add native Sign in with Apple later only if you want the conversion lift — and if you do, use `@capacitor-community/apple-sign-in` → `signInWithIdToken()` with the **raw (unhashed) nonce**. Do *not* use `signInWithOAuth` + deep-link redirect inside Capacitor: there's a documented failure mode where the PKCE code verifier disappears between the in-app browser and the WebView and the deep link returns silently doing nothing.
2. Replace `signedInClient()` with **JWT verification + a per-request client** carrying `global.headers.Authorization: Bearer <user token>`, so RLS still applies.
3. Switch the worker to the **`service_role` key** and write `user_id` explicitly from the `recipe_jobs` row (the job already knows its owner).
4. Audit every `recipe_*` RLS policy for true per-user isolation and **add a `user_id` index on each table** — RLS `user_id = auth.uid()` predicates without an index degrade badly.
5. In-app account deletion with full cascade **including Storage objects**.
6. Migrate your existing data.

### Phase 2 — Abuse & cost control (1.5 weeks)

- Kill `SHORTCUT_TOKEN` entirely once the Share Extension replaces the Shortcut. Drop `Allow-Origin: '*'` to the app origin plus the Capacitor scheme.
- Per-user monthly extraction quota — **a Postgres counter is sufficient.** Skip Upstash until you exceed ~10K req/min; at 10K DAU Upstash itself can run ~$600/mo.
- Global daily spend circuit breaker that hard-stops paid calls.
- **Per-import cost telemetry table** (path, model, input/output tokens, vendor charges, computed cost, keyed to user). Every number in §6 is a model, not a measurement.
- Per-IP rate limiting on any remaining unauthenticated surface.
- Synthetic monitoring: extract a known public reel every 15 min, alert on failure. Instrument success rate **per path** so degradation is visible before users report it.

### Phase 2b — Cost engineering (3 days, pays for itself immediately)

See §6 for the numbers. Four changes, none of which alter product behavior.

### Phase 3 — Capacitor shell (1.5 weeks)

The Vite migration is genuinely easier than Next.js static export. Three specific changes vs Sounder:

- `webDir: 'dist'` (Vite's output), build command `npm run build` (`tsc -b && vite build`)
- **`base: './'` in `vite.config.ts`** so asset URLs resolve under Capacitor's custom scheme
- **Disable `vite-plugin-pwa` for native builds** — a service worker inside a WKWebView shell is at best redundant and at worst serves stale assets that `cap sync` cannot invalidate

`react-router` v7 `BrowserRouter` works fine (Capacitor serves a single `index.html` from a local server root); `HashRouter` is the zero-risk fallback if deep-link edge cases appear. `contentInset: "never"` **must** be paired with `viewport-fit=cover` in the meta tag (already present in your `index.html`) or `env(safe-area-inset-*)` returns 0 on all sides. WebKit bug 191872 means safe-area values may not populate until shortly after load — prefer CSS-only layouts over JS reads.

**Ship a TestFlight build with NO share extension first**, to prove the reused Codemagic signing path end to end with exactly one new variable.

### Phase 4 — Share Extension (1.5 weeks, isolated milestone)

This is the schedule risk and **the one part of Sounder's CI that does not transfer.**

On iOS you cannot receive shared content in the main app. You need a **separate Share Extension target** that receives the payload, writes it to a shared **App Group** container, and wakes the host app via a **custom URL scheme**. Three maintained plugins scaffold most of it: `@capgo/capacitor-share-target` (open source), `@capawesome-team/capacitor-share-target` (sponsorware), `capacitor-share-extension`. All still require you to add the target in Xcode, configure the App Group entitlement, and register a URL type in Info.plist.

**The CI cost is the real one: a share extension is a second bundle ID needing its own provisioning profile.**
- Register `com.mitchellhartjes.<name>.ShareExtension` as a separate App ID
- Add **both** to the `app-store-connect fetch-signing-files` step in `codemagic.yaml`
- **Commit the `ios/` directory to git and treat it as source** — `npx cap sync` will otherwise clobber the hand-configured target

Accept both URLs and images (the screenshot path needs the extension to receive the `UIImage`, write it to the App Group, and hand off).

### Phase 5 — Offline (1 week)

The actual requirement is narrow: view a saved recipe and run cook mode on bad kitchen wifi. That's a **read-through cache**, not a sync engine. IndexedDB (or Capacitor Preferences/Filesystem) with hydrate-local-then-revalidate for the recipe library and covers (~3–5 days), plus an **outbox queue** for grocery/meal-plan writes (~2 days) — which also lets you delete the `fetch(..., {keepalive: true})` hack in `useMealPlan`.

**Do NOT adopt PowerSync.** It's a correct but heavyweight Postgres-logical-replication-into-per-client-SQLite answer to a problem that is 95% read cache, and it adds recurring cost.

### Phase 6 — App Store prep (1 week)

`PrivacyInfo.xcprivacy` manifest, Privacy Nutrition Labels written *from the actual list of data flows* and matching the policy line for line, screenshots that lead with cook mode, reviewer notes per §4.5, age-rating questionnaire completed.

### Reuse ledger

| ✅ Transfers verbatim from Sounder | ❌ Must be built new |
|---|---|
| `codemagic.yaml` skeleton | `capacitor.config` (appId, appName, `webDir: 'dist'`) |
| `app-store-connect fetch-signing-files` step | Build command + `base: './'` + PWA disable |
| **Single-line base64 cert-key handling** (the multiline-PEM failure you already hit — don't re-learn it) | **Share Extension + its second App ID + second provisioning profile** |
| TestFlight publish block | All auth, account deletion |
| Apple Developer enrollment (already in progress) | Quota + rate-limit + circuit-breaker layer |
| Capacitor 8 + `contentInset: "never"` + CSS `env()` safe areas | StoreKit / RevenueCat entitlement layer + server-side entitlement checks on import endpoints |
| The no-Mac-required-on-Windows workflow knowledge | Offline read-through cache + outbox |

**Codemagic economics are a non-issue:** 500 free macOS M2 build minutes/month, ~10–20 min per Capacitor iOS archive+sign+upload = **25–50 free TestFlight builds/month**. Overage $0.095/min. The $3,990/yr fixed plan is not remotely justified.

**One architectural note for later:** the GitHub Actions worker (dispatched by a Postgres trigger via `pg_net` using a PAT in Supabase Vault) does not survive multi-tenancy well — no concurrency control, no per-job timeouts, ffmpeg apt-installed per run, and the private-repo free allowance of 2,000 Linux minutes/month is only ~400 video reels/month **across all users**. Plan to replace it with a small always-on container (Fly.io/Railway, ~$5–20/mo) in Phase 2, which also gives you a global in-flight job cap that doubles as a cost circuit breaker. **Or, far cheaper: move the worker repo to public** — Actions minutes are free on public repos, secrets stay in GH Secrets, and that alone removes ~$0.03/reel.

---

## 6. Unit economics & monetization

### Corrected cost model

All figures use **current list pricing** verified against the live model catalog: Haiku 4.5 **$1/$5** per MTok, Sonnet 4.6 **$3/$15** per MTok. Your repo uses `EXTRACTION_MODEL=claude-haiku-4-5` and `VISION_MODEL=claude-sonnet-4-6`.

**[CORRECTED] There is no Sonnet pricing cliff coming for you.** One research track warned that "Claude Sonnet 5's introductory $2/$10 reverts to $3/$15 on 2026-08-31 — a 50% vision-cost increase landing in six weeks." **That does not apply.** You are on `claude-sonnet-4-6`, which is at flat $3/$15 with no introductory period. Do not budget for a shock that isn't coming. (Separately: do **not** casually "upgrade" the vision path to Sonnet 5 — it uses a new tokenizer producing ~30% more tokens for the same text, and it has high-resolution vision at up to 2576px long edge, which would make your frames *more* expensive unless you downscale. Sonnet 4.6 is the right model here.)

**[CORRECTED] Prompt caching is NOT available to you at current prompt sizes.** A research track listed "prompt-cache the ~1,200-token system prompt" as a top cost lever. **The minimum cacheable prefix is 4,096 tokens on Haiku 4.5 and 2,048 on Sonnet 4.6.** A 1,200-token system prompt silently will not cache — no error, just `cache_creation_input_tokens: 0`. Drop this lever from the plan; it would have been wasted effort producing zero savings.

**Vision token math (verified):** `ceil(width/28) × ceil(height/28)`. Your ffmpeg call is `fps=1/6,scale=768:-1`, `maxFrames=16`. A 768×1365 vertical frame = `ceil(768/28)=28 × ceil(1365/28)=49` = **1,372 tokens/frame**. At 512 wide (512×910): `19 × 33` = **627 tokens/frame** — a 54% cut per frame.

#### Cost per import, by path

| Path | Model | Tokens in / out | Anthropic | Other | **Total** |
|---|---|---|---|---|---|
| **Caption** (IG embed) | Haiku 4.5 | ~3,000 / 1,000 | $0.008 | Apify cover $0.0015 | **~$0.010** |
| **Website / Pinterest** | Haiku 4.5 | ~10,000 / 1,000 | $0.015 | — | **~$0.015** |
| **Screenshot** | Sonnet 4.6 vision | ~1,500 / 1,000 | $0.019 | — | **~$0.020** |
| **Video** *(today)* | Sonnet 4.6, 16 frames @768 | ~24,500 / 1,200 | $0.092 | Apify $0.0015–0.003, Groq $0.0007, Actions ~$0.03 (private repo) | **~$0.09–0.12** |
| **Video** *(optimized)* | Sonnet 4.6, 8 frames @512 | ~7,500 / 1,200 | $0.041 | Apify + Groq $0.003, Actions **$0** (public repo) | **~$0.044** |
| **Video** *(fully optimized)* | Haiku 4.5 vision + Batches API | ~7,500 / 1,200 | $0.007 | $0.003 | **~$0.010** |

**The video path is 9–12× the caption path and is the entire financial story.**

#### The four cost levers (3 days of work, ~45% blended reduction)

1. **`maxFrames` 16 → 8 and `scale=768:-1` → `scale=512:-1`** in `worker/lib/video.mjs` line 80 and line 123. Cuts the dominant token line ~77% (21,952 → 5,016 tokens).
2. **Move the GitHub Actions worker to a public repo.** Actions minutes are free on public repos; secrets stay in GH Secrets. Removes ~$0.03/reel — the single largest non-Anthropic line item — and removes the 2,000-min/month ceiling that would otherwise cap you at ~400 video reels/month *across all users*.
3. **Route the video path through the Message Batches API** for a **flat 50% discount on all token usage.** It's already an async queued job with multi-minute latency, so the UX contract barely changes. ⚠️ Caveat: batches typically complete inside an hour but the SLA is **24 hours**, not 1. Do not promise "~5 minutes" on a batched path — surface it as "we'll notify you when it's ready."
4. **A/B `claude-haiku-4-5` vs `claude-sonnet-4-6` for frame vision** when the Whisper transcript is strong. 3× cheaper. Test on dense on-screen text before committing.

**Bonus lever worth real money at scale:** a global extraction cache keyed on the Instagram shortcode. Public reel content is byte-identical for every user, and viral recipes get saved repeatedly — a shared `extractions` table could plausibly deflect 20–40% of all calls.

#### Blended cost and per-MAU

Assuming ~6 imports per active user per month.

| Scenario | Mix (caption/web/shot/video) | Blended/import | Cost/MAU/mo |
|---|---|---|---|
| Today, your curated usage | 60 / 20 / 10 / 10 | $0.022 | $0.13 |
| Today, public launch | 35 / 15 / 10 / **40** | $0.052 | **$0.31** |
| Optimized, your usage | 60 / 20 / 10 / 10 | $0.0125 | $0.075 |
| **Optimized, public launch** | 35 / 15 / 10 / **40** | **$0.0138** | **$0.083** |

**The cost cliff is the video-path share, not user count — and public launch is exactly what causes the shift.** Today you curate what you share, so the cheap caption path dominates. Public users will share whatever reel they see, including the audience-restricted, age-gated, and caption-less ones the caption path cannot read. Every one of those falls through to the expensive path. **Unoptimized, that shift alone multiplies your blended cost 2.4×. Optimized, it's a rounding error.** Do the 3 days of work before opening signups.

#### Total run cost at scale

| MAU | Imports/mo | AI + Apify (opt.) | Infra | **Total/mo** | **$/MAU** |
|---|---|---|---|---|---|
| 1,000 | 6,000 | $83 | Supabase Pro $25 + Netlify Pro $19 | **~$127** | $0.13 |
| 10,000 | 60,000 | $828 | ~$85 | **~$913** | $0.09 |
| 100,000 | 600,000 | $8,280 | Supabase ~$280 (≈2 TB image egress, ~60 GB DB, Large compute) + Netlify ~$100 + Apify Scale $199 | **~$8,860** | $0.09 |

Extraction is ~90% of the bill at every tier. **Infrastructure is noise until 100K MAU, where Supabase Storage egress on re-hosted cover images becomes the one line that actually bites (~$150–280/mo at $0.09/GB).** Two free mitigations: `sharp` is already a devDependency but is not used in the rehost path — **capping covers at ~1200px wide would cut egress several-fold for nothing**, and the images already live in a single public bucket so moving behind Cloudflare R2 or Bunny later is a URL rewrite, not a re-architecture. (And if you follow §4.2 and stop re-hosting third-party photos, this problem largely evaporates.)

### Pricing recommendation

**One paid tier. Freemium with a LIFETIME free allowance — never a recurring monthly one.**

This is the most important structural point in the section. **A monthly free allowance is an annuity of cost paid to non-payers. A lifetime allowance is a one-time customer-acquisition cost.** Modeled per 100 installs:

| Free tier | Conversion | Monthly cost of free users | Monthly net |
|---|---|---|---|
| 3 imports/**month** | 2% | $9.75 forever | **−$1.37/mo, forever, and worsening** |
| 5 imports/**month** | 2% | $16.25 forever | **−$7.87/mo** |
| 10 imports/**month** | 5% | $32.50 forever | **−$10.56/mo** |
| **15 imports, one-time lifetime** | 2.5% | **$18.75 once** | **+$37 net per 100 installs** |

Even a 20-import lifetime grant at 1% conversion is net positive.

| | Recommendation |
|---|---|
| **Free forever** | Unlimited manual recipe entry, unlimited use of already-saved recipes, cook mode, grocery list, meal planner, search, categories, dark mode, offline vault. **Plus a one-time grant of 15 AI imports that never resets.** Frame it in-app as *"15 free AI imports to try it"* — honest, generous-feeling, financially bounded. **Enforce with a server-side counter, not a client-side one.** |
| **Price** | **$4.99/month, $39.99/year** (33% annual discount), **14-day free trial**. The annual is the product you actually sell. |
| **Trial length** | 14 days is deliberate: RevenueCat 2026 shows **17–32 day trials convert at 42.5% median vs 25.5% for sub-4-day trials** — a ~70% difference. 55.4% of 3-day-trial cancellations happen on day 0. |
| **Paywall copy** | **Never write "unlimited."** Write the real number: *"200 AI imports a month — more than anyone we know cooks."* Behind it, cap the expensive video path separately at ~40/month, surfaced as fair use. This avoids a 3.1.2 bait-and-switch exposure and turns a future limit increase into a feature announcement rather than a defended broken promise. |
| **Video path gating** | **Paid tier only.** Free users get caption/website/screenshot. It's genuinely the expensive feature, so it's the natural paywall boundary — and it doubles as your 5.2.3 risk reduction. |
| **Lifetime unlock** | **Do NOT ship one at launch**, despite Flavorish offering $39.99. A one-time payment against recurring inference COGS is an unbounded liability. If subscription resistance proves to be a real blocker later, attach lifetime to the **zero-COGS surface only** (unlimited manual recipes, cook mode, grocery list, household sharing, sync) while keeping AI imports metered, and price it at **$99–149** (3–4× annual), not 1×. |
| **Household tier** | **Ship a separate, higher-priced `Household` annual SKU at ~$59.99/yr with Apple Family Sharing enabled**, and leave Family Sharing **OFF** on the individual SKU. ⚠️ **Enabling Family Sharing on a subscription is IRREVERSIBLE.** Enabling it on the individual SKU permanently donates up to 6 seats for the price of one and forecloses this tier forever. Your shared grocery list + weekly planner over Supabase realtime is the single best premium hook you have: genuinely differentiated, retention-positive, creates a second person with a stake in the subscription, and its marginal COGS is essentially zero. Honeydew already proves willingness to pay at $49.99/yr for exactly this. |

### Break-even

At $39.99/yr with Apple SBP (15%) + RevenueCat (1%): **net $2.80/subscriber/month.**

| COGS scenario | Break-even blended imports/mo | Break-even **video-only** imports/mo |
|---|---|---|
| Today (unoptimized) | 127 | **25** ← a 30-video/month user is *negative* |
| After the 4 levers | 224 | **187** |

**This is the number that justifies the 3 days of work.** Unoptimized, a genuinely heavy video user at 30 reels/month costs $3.30 against $2.80 of revenue — a −18% gross margin. Optimized, that same user costs $0.45 — an **84% margin**. The optimization moves the pathological user from loss-making to comfortably profitable, and it's the difference between "unlimited" being safe and being ruinous.

**Plan for 60–75% gross margin, not 90%.** ICONIQ's Jan 2026 State of AI puts AI product gross margins at ~52% on average, with inference averaging 23% of revenue at scaling-stage companies — and that share *rises* as products mature. Your advantage is that inference is short, bounded, and one-shot (extract a recipe, done) rather than open-ended chat, so 60–76% is achievable — but only with a bounded free tier and cost-aware model routing.

### Revenue reality check

| Installs | Conversion | Net/mo at $39.99/yr |
|---|---|---|
| 1,000 | 2.5% | **~$78** |
| 10,000 | 2.5% | **~$780** |
| 100,000 | 2.5% | **~$7,800** (~$94K/yr) |
| ReciMe scale (~800K–1M users) | — | ~$2M/yr, with 31 employees |

Also budget for: **~72% of annual subscribers cancel within year one** (worsened from 56% in 2025), 35% of those in month 1, and **AI apps churn 36% worse on monthly plans** than non-AI apps. Push annual hard — it front-loads cash against COGS that accrues monthly. **Build retention on the zero-COGS surface** (grocery list, weekly planner, household sharing, cook history) — a user who cooks from the app weekly churns far less than one who imported during a burst and stopped.

**Two housekeeping items worth real money for near-zero effort:**
- **Enroll in the App Store Small Business Program the day the developer account is active.** 15% vs 30% commission up to $1M in proceeds. It's a form, and it's worth **+22% net revenue on every dollar** ($4.19 vs $3.44 net on a $4.99 sale). You qualify automatically as a new developer.
- **Use RevenueCat, not raw StoreKit 2.** Free below $2,500 monthly tracked revenue (you will not cross that in year one), then 1%. It handles receipt validation, entitlements, Family Sharing, paywall A/B testing, and cohort analytics that would otherwise be weeks of work. It runs on StoreKit 2 underneath, so migrating off later is low-risk rather than lock-in.
- **Do not build any model that assumes 0% commission on US external-payment link-outs.** The Ninth Circuit reversed the strict zero-commission remedy in Dec 2025 and remanded for a "reasonable" rate; the Supreme Court denied Apple's stay in May 2026. It's unresolved.

---

## 7. Positioning, naming & ASO

### The one-sentence pitch

> **The recipe app for people who save 200 reels and cook four of them. It remembers what you actually made, how it turned out, and quietly puts it back in front of you.**

This is the sharpest available position because **everyone in this market sells "save the reel." Nobody sells "you actually cooked it."**

### Beachhead user

**Women 25–44, skewing parents, Pinterest/Instagram-native — not the Gen Z TikTok stereotype.** Gen Z is where the *attention* is (45% say social media influenced their last new recipe; 84% have tried a social food trend), but the *paying* cohort skews older and more female: Pinterest is 70.3% women with an average user aged 25–34, and meal-planning need concentrates in households with kids. Your grocery list and This Week's Meals planner already point this direction — lean into them in the store screenshots.

Narrow it further: **the heavy saver with a graveyard of saved reels and chronic 6pm-on-a-Tuesday decision fatigue.** Not the meal-planning parent (owned by Samsung Food / Plan to Eat). Not the cookbook digitizer (owned by Paprika / CookBook).

### Marketing wedge: aim at Paprika's users, not ReciMe's

Paprika has **53,000 ratings at 4.9 stars**, is the #1 paid app in Food & Drink, has been in maintenance mode since ~Sept 2023, and **cannot import from Instagram or TikTok at all.** Its users complain about paying separately per platform, paying again for major versions without notice, and printing bugs.

> *"Everything you love about Paprika — plus it can read the reel."*

That is a far better wedge than fighting ReciMe on its own turf. Head-on against ReciMe you are a worse-funded copy; against Paprika you are the obvious upgrade.

### Build the cook-log as a visible, first-class object

This is the moat and it's currently invisible. Concretely:

- A **"Made it"** confirmation at the end of cook mode, with an optional one-tap photo *(which also gives you a legitimate, copyright-clean cover image — see §4.2)*
- A per-recipe history strip: *"made 4×, last on 3 June, always at 6 servings"*
- A **"Cook it again"** home rail driven by cadence, not recency
- Remembered per-recipe overrides — your scale factor, your substitutions, your skipped ingredients — reapplied automatically

Capture data transfers to a competitor in an afternoon. Cook history does not, and it compounds.

### The name

**Retire "Dilla."** Three independent problems, any one of which is disqualifying:

1. **ASO invisibility** — searching "Dilla" surfaces J Dilla the musician (estate-managed at jdilla.com), Dilla Ethiopian Restaurant, Dilla University Portal, DillaStudio. Zero relevant search volume, and you inherit none.
2. **Live App Store collision** — an app titled **DILLA** already exists (id1644111197).
3. **Trademark proximity** — **"Dillas Quesadillas"** is an operating US restaurant chain with its own App Store app (id6474457232). A food-sector mark against a food app whose name derives from *quesadilla* is exactly the likelihood-of-confusion fact pattern examiners look for. ⚠️ *This is medium confidence — a direct USPTO query failed during research. Commission a real clearance search in classes 009 (software), 042 (SaaS), and check 029/030/043 conflicts before committing.*

Every obvious culinary one-word name is claimed — Ladle (×2), Simmer (×3), Mise (×2), Pestle, Deglaze, Pluck, Preplo, Recipy, Peel, Inspo, Flavorish, CookBook, Honeydew, TasteOS, Nutrola, Pantry Pilot, Recipe Bro, Cooked. That saturation is itself the clearest available measure of how crowded this category is.

**Format: Brand + one relevant generic keyword, ~25–30 characters total.** The keyword carries discovery; the brand carries word of mouth.

| Candidate | Full title (chars) | Why |
|---|---|---|
| **Rotation** ⭐ | `Rotation — Cook What You Save` (29) | **Recommended.** It *is* the positioning in one word: "the recipes in your rotation" is exactly the cook-log thesis. Real word, not a food-app cliché, no obvious collision. |
| **Repertoire** | `Repertoire: Recipes You Cook` (28) | A cook's repertoire = the dishes they actually make. Thematically perfect, slightly more formal. |
| **Trivet** | `Trivet — Save & Cook Recipes` (28) | Concrete kitchen object, short, memorable, likely clear. |
| **Larder** | `Larder: Your Recipe Vault` (25) | Warm, food-adjacent, less on-thesis than Rotation. |
| **Bench** | `Bench — Recipes You Actually Cook` (33) | Slightly long; "bench" is overloaded in software. |

⚠️ **Run every candidate through: (a) App Store search, (b) a real USPTO clearance search, (c) domain + social handle availability — before creating any App Store Connect record.**

### Channel & timing

- **Organic short-form video on the platforms users save from.** The product demo (reel in → recipe out) is inherently native content. ReciMe's 346K Instagram followers show the channel works. Build the audience in the months prior.
- **Target January.** Health/fitness app installs ran 46% above average on January 1; New Year eating-habit resets drive meal-planning intent. Thanksgiving and Christmas baking are secondary keyword windows.
- **Do not invest in SEO comparison content.** "Best recipe app 2026" is fully colonized by at least a dozen competitor-owned blogs (Pluck, Peel, RecipeOne, Preplo, DrizzleLemons, Forkee, MealThinker, FoodiePrep, Nutrola, Fond, Recipy, mise), each ranking its own product first — and, as established, several of them publish outright fabrications.
- **Never frame marketing around scraping.** Frame it as *"keep the recipes you already saved."*

**One genuinely novel asset available to you:** no rigorous public data exists on saved-recipe loss. Every "X% of saved recipes are never cooked" figure in circulation traces to marketing copy, not research. **A small survey of your target cohort would produce the only primary research in the category** — quotable, rankable, and free to run.

---

## 8. The plan

### Phase 0 — Decide (this week, ~1 week)

| Deliverable | Owner |
|---|---|
| Anthropic/Apify/Groq spend caps set | **Today, 30 min** |
| Name chosen + USPTO clearance search commissioned | You |
| v1 path mix locked (recommend: caption/web/screenshot ON, video paid-only) | You |
| Price + free-tier bound locked ($4.99/$39.99, 15 lifetime imports) | You |
| DMCA agent registered (~$6); privacy policy + ToS live | You |
| Sounder `codemagic.yaml` verified against Xcode 26 / iOS 26 SDK | 1 hr |

### Phase 1 — Make it safe & multi-tenant (4.5 weeks)

Strip the UA spoof (replace with honest flagged fetch). Strip Apify from the shipped path. Stop re-hosting third-party photos; kill the Pexels fallback; make the gradient card the default. Add permanent creator attribution + tap-through. Multi-tenancy (auth, RLS, worker `service_role`, indices, account deletion). Quotas + circuit breaker + cost telemetry. **The 4 cost levers.**

### Phase 2 — Native shell (3 weeks)

Capacitor 8 + Codemagic, TestFlight with no extension first. Then Share Extension as an isolated milestone. AI consent sheet (5.1.2(i)). Offline read-through cache + outbox. This Week's Meals widget.

### Phase 3 — Monetize & submit (2 weeks + 2–4 buffer)

RevenueCat + StoreKit, server-side entitlement checks on import endpoints. Household SKU decision made *before* the first paid SKU ships (Family Sharing is irreversible). SBP enrollment. Screenshots leading with cook mode. Reviewer notes. **Budget for 1–2 rejection cycles.**

### Recommended first milestone (do this before anything else)

> **A TestFlight build, under the new name, that runs cook mode offline and imports via a native Share Extension from a screenshot — with the Googlebot UA spoof and Apify entirely absent from the binary, and creator attribution rendering on every card.**

Why this specific milestone: it proves the three highest-risk unknowns at once — (a) the Codemagic signing path with a second bundle ID, which is the part of Sounder's CI that doesn't transfer; (b) that the app is genuinely usable with zero scraping, which is your fallback position if Meta ever moves; (c) that the cook-side experience holds up on a real device. Everything else is incremental once these three are true.

### Kill criteria — what should tell you to stop

Write these down now, before you're emotionally invested. Any **one** of these is a stop-or-radically-rethink signal:

1. **Two consecutive App Review rejections citing 5.2.2 or 5.2.3 after you've already removed the UA spoof and Apify.** If Apple won't accept the honest-fetch posture, the whole category is closed to you and no amount of iteration fixes it.
2. **You cannot clear the name in classes 009/042 without a lawyer's caveat, and no acceptable alternative clears either.** A name you have to defend is a name that costs more than the app earns.
3. **Fewer than 1,000 installs in the 90 days after a January launch, with the organic video channel actually worked** (not "I posted three times"). At 1,000 installs the app nets ~$78/month. If you can't reach 1,000 with the launch window and the native-content advantage, distribution is the binding constraint and more product work won't move it.
4. **Measured per-MAU COGS exceeds ~$0.25 after the optimization levers land.** That means the video-path share is worse than modeled and your margin structure doesn't support the price. (You'll know this from the telemetry table in Phase 2, not from guessing.)
5. **Meta ships native recipe extraction in Instagram, or blocks the embed endpoints.** As of mid-2026 Instagram's built-in save is still just a bookmark and there's no native structured-recipe feature — the shoe has not dropped. But if it does, the entire third-party segment goes with it. This is why the cook-side must be the identity: if ingestion degrades to manual paste and screenshots, the app has to still be worth opening.
6. **You stop enjoying it.** This is a solo project with a realistic ceiling in the low hundreds per month. If it becomes a second job you resent, the correct move is to keep it as a superb personal app — which it already is — and stop.

**Time-box the whole thing.** Set a hard date (e.g. 16 weeks from Phase 0 start) and a pre-agreed decision point. The competitive set includes a VC-backed company, a Samsung subsidiary, and a dozen funded startups shipping weekly. **Explicitly refuse the feature-parity race** — it is unwinnable and will consume you with no payoff. Pick one narrow position and win it completely.

---

## 9. Open questions for Mitchell

These are the decisions only you can make. Everything above is contingent on them.

1. **What outcome makes this worth 12 weeks?** A great personal app plus a portfolio piece? Beer money? A real side income? Be honest with yourself now, because the plan differs. If it's "a great app I'm proud of that a few thousand people pay for," this plan is right. If it's "meaningful income," the numbers in §6 say the answer is probably no and you should know that before Phase 1, not after Phase 3.

2. **Are you willing to break the Sounder playbook and ship paid on day one?** This is the sharpest conflict with your established process. Sounder ships free-with-no-IAP deliberately, to reduce first-review risk. That logic does not transfer, because Dilla's COGS starts the moment a user imports. Shipping free means paying Anthropic for every user's heaviest month with zero revenue. **My recommendation is free-with-IAP.** But it adds a 3.1 review surface you deliberately avoided with Sounder, and that's your call.

3. **What is the name?** Nothing downstream can start until this is settled — App Store Connect record, bundle IDs, provisioning profiles, Codemagic config, domain, social handles all depend on it. And renaming after launch destroys accumulated ASO and reviews. **This is the single highest-leverage unblocked decision.**

4. **Do you ship the video path in v1 at all?** It's your most distinctive technical claim ("works even when the recipe is never written down") and simultaneously your largest 5.2.3 exposure and 9× your cheapest path. Three options: (a) omit from v1, add in v2 once approved; (b) ship paid-tier-only with a 40/month cap; (c) ship it and accept the review risk. **I'd take (a) for the first submission and (b) for v1.1** — get approved first, then add the risky-but-differentiating capability to an app that already exists.

5. **Are you willing to let creators be visible?** Permanent, non-removable creator handle and tap-through on every recipe card and at the top of cook mode. This is your single best defense against both Recipeasly-style backlash and the fair-use market-substitution factor — but it's a real design constraint on every screen, and it means the app is explicitly *sending traffic away*. If you're not willing to do this, the copyright and reputational math gets meaningfully worse.

6. **Household tier: yes or no — and decide before the first paid SKU ships.** Enabling Apple Family Sharing on a subscription is **irreversible**. Enabling it on the individual SKU permanently donates up to 6 seats for the price of one. The shared grocery list over Supabase realtime is your best premium hook and its marginal COGS is ~zero. But it's a second SKU to maintain and price.

7. **Two things to verify yourself before Phase 1, because I could only confirm them from secondary sources:**
   - **Meta's tokenless oEmbed** (reportedly no access token, no App Review, since ~June 15 2026) — confirm from Meta's own developer changelog. If real, it's a documented "permitted use" you can cite by name in your App Review notes, which is exactly what 5.2.2 asks for.
   - **What Pestle and ReciMe actually do server-side** behind the share sheet. An iOS share hands the extension a permalink URL, not caption text, so both of them must still resolve that URL somehow. Nobody has verified how. If they use a plain honest fetch, that's strong evidence the honest posture is survivable in this category. Treat "they are cleanly compliant" as unproven until you check.

8. **How much are you willing to spend on the things money can actually solve?** A USPTO clearance search (~$300–1,500 with a firm), an hour of an IP attorney's time on the photo-rehosting question, or a small survey of the target cohort. These are the few places where cash meaningfully de-risks a solo project — and all three are cheap relative to 12 weeks of your evenings.