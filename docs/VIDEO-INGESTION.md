# Video reel ingestion without scraping — findings & recommended design

Research: 4 parallel tracks (iOS share payload, Capacitor plumbing, alternative
acquisition, competitor behaviour), 2026-07-21. The verification pass was cut
short by a session limit, so claims below carry the researchers' own confidence
levels; the three marked **must-test** are the ones to falsify empirically before
committing engineering time.

---

## 1. The direct answer

**Instagram's share sheet hands your Share Extension a permalink URL. Never the
video bytes.** (High confidence, convergent, but note: no one has published an
actual `registeredTypeIdentifiers` dump from Instagram — **must-test**.)

The decisive evidence is behavioural rather than documentary. *Every* competitor
fails on exactly the same boundary: private/restricted accounts.

- Pluck: "Private accounts won't work… Pluck fetches the recipe from the public URL."
- ReciMe: "ReciMe can only see what's public, so we can't pull recipes from
  private social media accounts."
- Mela: "Mela comes with its own share extension. All it needs is a link."
- Deglaze: pasting a URL imports "the same way" as the share sheet.

If the extension received the actual bytes, private reels would import perfectly —
the user is authenticated and literally watching the video when they tap Share.
That ~13 well-funded apps all fail at the *server-fetchability* boundary and none
at the *what-the-user-can-see* boundary is engineering-decisive.

Expect `public.url` **and/or** `public.plain-text` (iOS Shortcuts users report
Instagram sometimes vending the link as plain text, which is why a URL-only
activation rule can silently receive nothing). `com.instagram.exclusivegram` is a
red herring — it's an *inbound* UTI for pushing media *into* Instagram.

Also: shared IG URLs carry an `igsh=` tracking parameter that ties the share back
to the sharing user's profile. **Normalise to the bare `/reel/{shortcode}/`
before storing or logging.**

---

## 2. What this means for the video pipeline

The ffmpeg → Whisper → vision pipeline is fine. **The acquisition method is the
only problem**, and there is a clean, legitimate replacement:

**Instagram shipped a first-party Download button for public reels (global,
23 Nov 2023).** The user taps share → Download; the mp4 lands in their camera
roll. Sharing *from Photos* delivers a genuine `public.movie` file URL.

That is the "explicit authorization from the source" that Guideline 5.2.3 asks
for — Instagram's own code did the saving, the user owns the file, and the app
scrapes nothing. Architecturally identical to any video-editing app.

### The failure modes are anti-correlated — this is the key insight

Downloaded reels lose their audio **when the reel uses licensed background
music**; only original audio survives. That sounds fatal until you line it up
against the actual use case:

| Reel type | Download audio | Where the recipe is | Covered by |
|---|---|---|---|
| Creator speaks over **original** audio | ✅ kept | spoken | Whisper transcript |
| Reel scored with **licensed music** | ❌ stripped | on-screen text | OCR / vision on frames |

The reels whose audio gets stripped are precisely the ones where the recipe is
on-screen text instead. **must-test:** whether the strip is track-aware or
blanket when a voiceover is mixed over licensed music — that's the one case that
could fall through both nets.

### Coverage gaps to design around

- Public accounts only.
- Creators can disable downloads (Settings → Privacy → Reels and Remix); OFF by
  default for under-18 accounts. Food creators have commercial reasons to
  disable it, so assume a non-trivial miss rate.
- Downloads carry an Instagram watermark + the creator's username burned into the
  frame. **This is a feature** — the vision prompt can read it to populate
  `source_author`, which strengthens the "we attribute, we don't republish" posture.
- **Screen recording is the universal fallback.** Instagram applies no DRM to
  reels, so it always works — including download-disabled reels. ⚠️ The user must
  do this via the OS. If the app ever initiated capture itself (ReplayKit /
  Broadcast Upload Extension), that becomes a media-capture tool aimed at
  Instagram and should expect a 5.2.3 rejection.

---

## 3. Acquisition paths, ranked

| Path | Compliance | Reliability | Friction | Cost | Verdict |
|---|---|---|---|---|---|
| **Screenshot → vision** (shipped) | ✅ clean | High for on-screen text; **zero for spoken** | 1 tap | ~$0.020 | Keep. Complement, not substitute. |
| **Save to camera roll → share from Photos** | ✅ Instagram's own download button = authorization | Good; fails on download-disabled + private | +2 taps | ~$0.044 opt. | **The recommended v1.1 video path** |
| **Screen record → share from Photos** | ✅ user's own OS feature | ~100%, incl. restricted | +several taps | same | Documented fallback |
| **On-device AVFoundation + Speech + Vision** | ✅ nothing leaves device for the heavy part | ~70–80% of users (device floor) | none extra | **$0** | Strategic upgrade — see §5 |
| Server-side URL fetch (what competitors do) | ⚠️ relocates the 5.2.3 problem | High | 1 tap | low | Survivorship, not safety |
| **Apify** (current) | ❌ 5.2.2 + 5.2.3 | Degrading — IG actively blocks the actor | 1 tap | ~$0.09–0.12 | **Remove** |
| Meta oEmbed | ✅ | — | — | free | **Dead end.** See below. |
| Graph API / Basic Display | — | — | — | — | **Hard dead end.** See below. |

### Two definitive dead ends (both previously flagged as "maybe")

**Tokenless oEmbed is real but useless.** Meta did publish "Introducing Tokenless
Access to Meta oEmbed APIs" on 2026-06-15 — so that claim was true. But
`/instagram_oembed` returns exactly six fields: `html`, `provider_name`,
`provider_url`, `type`, `version`, `width`. **No caption, no author, no
thumbnail, no media URL** — `author_name` and `thumbnail_url` were removed
2025-11-03. It's an attribution/display tool, not a data source. Still worth
citing by name in App Review notes as a documented permitted endpoint, but it
cannot feed extraction.

**There is no legitimate API that reads another creator's reel.** Basic Display
died 2024-12-04. Its replacement only exposes the *authenticated user's own*
media. Public Content Access closed to new developers in 2020. Meta Content
Library requires academic/NGO credentials. This door is closed, full stop.

---

## 4. What competitors actually do

- **No recipe app has ever been removed from the App Store for Instagram
  scraping** — searched hard, found zero. The removals that exist (The OG App,
  Wrapped, Like Patrol, InstaAgent) were feed clients or data harvesters, not
  content-extraction utilities that output text. *Absence of evidence, not proof
  of safety.*
- **Apple's real 5.2.3 rejections hinge on handing the user the media file.**
  Verbatim rejection text: *"your app allows users to download video from
  Instagram."* Recipe apps survive because they output structured text, never
  return the media, and don't replicate Instagram's viewing experience. **Dilla's
  exposure is therefore not the ffmpeg pipeline per se — it's anything that
  surfaces or persists the video to the user.** (We never do; the mp4 is
  transient in the worker. Keep it that way and say so in review notes.)
- **Video-only reels are largely unsolved by the market.** Plan to Eat: "We
  cannot get recipe data from only audio or video." Pestle is caption-only.
  Flavorish admits it "does its best to fill in the blanks using available
  information such as dish name and hashtags" — i.e. it *confabulates a recipe
  from the title*. Only Pluck, Deglaze and Stashcook claim genuine frame
  analysis. **This capability is a real differentiator.**
- **"Screenshot it instead" is the documented industry escape hatch** — ReciMe
  has a whole help article on it. Our screenshot path isn't a workaround; it's
  the category norm.
- The current Apify actor is independently fragile: its own issue tracker has an
  open report that "Instagram has banned this scraper… redirects the scraper to
  the login page."

---

## 5. Recommended design

### v1 (submit this)
Caption (honest UA) + website + **screenshot**. No Apify in the binary. The
extension accepts URLs, text, images and movies from day one — we just don't ship
the server video path yet.

### v1.1 (after approval)
"Import from a saved video": user downloads the reel (or screen-records it),
shares from Photos, and the same ffmpeg → Whisper → vision pipeline runs on a
file the user lawfully possesses.

### v2 (the strategic move)
**Do the heavy work on-device.** iOS 26's `SpeechAnalyzer` / `SpeechTranscriber`
removed the old ~1-minute ceiling and transcribes *files*, and
`RecognizeTextRequest` (iOS 18+) does OCR on-device. Pair with
`AVAssetImageGenerator` for frames and you get:

- **Whisper cost → $0**, frame-vision cost → near $0
- No 10–40 MB upload; the network payload becomes ~16 JPEGs + a small audio file,
  or just text
- A genuinely better privacy story: *"your videos never leave your phone"*
- ffmpeg disappears from the stack

Gate on `SpeechTranscriber.isAvailable` at runtime (roughly iPhone 12+; false on
Simulator, so physical-device testing required) and keep the server path as the
fallback for the ~20–30% of devices that can't.

### Info.plist activation rule (accept everything)

```xml
<key>NSExtensionActivationRule</key>
<dict>
  <key>NSExtensionActivationSupportsWebURLWithMaxCount</key><integer>1</integer>
  <key>NSExtensionActivationSupportsMovieWithMaxCount</key><integer>1</integer>
  <key>NSExtensionActivationSupportsImageWithMaxCount</key><integer>1</integer>
  <key>NSExtensionActivationSupportsFileWithMaxCount</key><integer>1</integer>
  <key>NSExtensionActivationSupportsText</key><true/>
  <key>NSExtensionActivationUsesStrictMatching</key><false/>
</dict>
```

⚠️ Xcode's default template ships `TRUEPREDICATE`, which claims *everything* and
is a rejection risk. Replace it. Declare **both** URL and Text — Instagram
sometimes vends the link as plain text, and a URL-only rule receives nothing.

### Plugin choice

**No plugin removes the native work — the plugin is ~5% of the job.** You write
`ShareViewController.swift` regardless.

- `@capgo/capacitor-share-target` — v8.0.44 (2026-07-11), MPL-2.0, the only one
  genuinely published for Capacitor 8. But it is a *reader*: your Swift writes a
  JSON blob to `UserDefaults(suiteName:)`, the plugin emits `shareReceived`.
- `send-intent` — MIT, but npm `latest` is still 7.0.0 (Cap 8 tagged on GitHub
  only). **Most useful anyway**: its README ships a complete, copy-pasteable
  `ShareViewController` with `handleTypeMovie()`, `handleTypeImage()`,
  `handleTypeUrl()` and `createSharedFileUrl()`.
- `@capawesome-team/...` — sponsorware; you'd be paying for maintained glue.
- `capacitor-share-extension` — two majors stale. Skip.

**Plan: `@capgo` for the Cap 8 bridge, `send-intent`'s Swift as the reference
implementation.**

### Codemagic (second bundle ID)

The extension is a separate App ID needing its own profile:

```yaml
- name: Fetch signing files
  script: |
    keychain initialize
    echo "$CERT_KEY_B64" | base64 --decode > /tmp/cert_key
    for ID in "$BUNDLE_ID" "$BUNDLE_ID.ShareExtension"; do
      app-store-connect fetch-signing-files "$ID" \
        --type IOS_APP_STORE --create \
        --certificate-key=@file:/tmp/cert_key
    done
    keychain add-certificates
    xcode-project use-profiles
```

---

## 6. Gotchas that will bite

1. **120 MB extension memory cap is real** (`EXC_RESOURCE RESOURCE_TYPE_MEMORY
   limit=120 MB`) — but it's a *RAM* ceiling, not a file-size ceiling. A 200 MB
   video is fine if you never materialise it: use `copyItem` /
   `loadFileRepresentation` to stream to disk. Loading into `Data`/`UIImage` kills you.
2. **Never render the Capacitor WebView in the extension.** A React Native share
   extension measured 92 MB *before touching media*. The extension must be
   native, headless, and do nothing but copy the file and wake the app.
3. **The Photos temp file is booby-trapped**: the returned URL's extension can
   disagree with the actual file on disk (sniff the real type), and the file is
   transient — copy it into the App Group container immediately.
4. **`npx cap sync ios` will clobber a hand-added target.** Commit `ios/` to git
   and treat it as source.
5. `NSExtensionActivationSupportsWebPageWithMaxCount` needs a JS preprocessing
   file and only fires from Safari — it won't help with Instagram.
6. Strip `igsh=` before storing or logging any shared URL.

---

## 7. Verdict

**"Video extraction without scraping" is a real product capability, not a
consolation prize** — but it costs the user two extra taps, and it's a v1.1
feature rather than a v1 one.

What to tell users, honestly:

> Share any recipe post and we'll pull the ingredients and steps out of it. If
> the recipe is only spoken or shown in the video, save the reel to your camera
> roll and share that — we'll watch and listen to it for you.

That's more honest than what most competitors do (one of which openly admits to
inventing recipes from the dish name), and it's defensible to App Review in a
single sentence.

**What we lose vs Apify:** one tap of convenience, and download-disabled reels.
**What we gain:** an app that can't be removed on a Meta complaint, and a path to
doing it all on-device for free.
