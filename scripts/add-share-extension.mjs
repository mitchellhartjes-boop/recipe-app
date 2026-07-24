// Adds the Share Extension target to the Xcode project.
//
// Why a script instead of committing a hand-edited project.pbxproj: the pbxproj
// format coordinates entries across ~10 sections with matching UUIDs, and
// `npx cap sync ios` rewrites parts of the file. Running this after sync makes
// the target reproducible on a fresh clone and on CI, where nobody can open
// Xcode. It is idempotent — a second run is a no-op.
//
// Run: node scripts/add-share-extension.mjs   (npm run sync:ios does it for you)
import xcode from 'xcode'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projPath = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj')

const TARGET = 'ShareExtension'
const GROUP_DIR = 'ShareExtension' // relative to ios/App
const APP_BUNDLE = 'com.mitchellhartjes.dilla'
const EXT_BUNDLE = `${APP_BUNDLE}.${TARGET}`

if (!existsSync(projPath)) {
  console.error('No Xcode project — run `npx cap add ios` first.')
  process.exit(1)
}

// Canonical AppDelegate. Written verbatim when `cap add ios` regenerates the
// template (detected by the missing DILLA-SHARE-UPLOAD marker). Must match
// ios/App/App/AppDelegate.swift exactly.
const APP_DELEGATE = `import UIKit
import UserNotifications
import Capacitor

// DILLA-SHARE-UPLOAD marker — this AppDelegate also receives the Share
// Extension's BACKGROUND upload and posts the "Saved to Dilla" notification.
// The Share Extension hands its upload to iOS and dismisses immediately; iOS
// finishes the transfer and relaunches this app in the background to deliver the
// result. We adopt the same-identified background session, read submit.mjs's
// {ok,status,message}, and post a local notification.
//
// ⚠️ Keep this file in sync with the copy embedded in
// scripts/add-share-extension.mjs, which rewrites it verbatim if \`npx cap add
// ios\` ever regenerates ios/ from the Capacitor template.

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, URLSessionDataDelegate, UNUserNotificationCenterDelegate {

    static let uploadSessionId = "com.mitchellhartjes.dilla.share-upload"
    static let appGroupId = "group.com.mitchellhartjes.dilla"

    var window: UIWindow?

    // Held while iOS has relaunched us in the background purely to finish the
    // upload; must be called once all of the session's events are delivered.
    private var backgroundCompletion: (() -> Void)?
    // Response bytes accumulated per task (upload tasks report their response
    // body through the data-delegate callback below).
    private var responseBytes: [Int: Data] = [:]
    // Keeps us from telling iOS "you may suspend me" until every posted
    // notification has actually been handed to the notification daemon.
    private let notifyGroup = DispatchGroup()

    // The session that adopts the Share Extension's background upload. Merely
    // creating it reconnects to any transfer the extension started while we were
    // suspended, so the delegate callbacks fire and we can notify.
    private lazy var uploadSession: URLSession = {
        let cfg = URLSessionConfiguration.background(withIdentifier: AppDelegate.uploadSessionId)
        cfg.sharedContainerIdentifier = AppDelegate.appGroupId
        cfg.sessionSendsLaunchEvents = true
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Present our own notifications while the app is frontmost — without a
        // delegate iOS silently suppresses them, so an import that lands while
        // the user is looking at Dilla would produce no feedback at all.
        UNUserNotificationCenter.current().delegate = self
        requestNotificationAuthorization(canPrompt: application.applicationState != .background)
        // Touch the session so we adopt any upload the extension already started
        // (covers the case where the app is opened before the upload finishes).
        _ = uploadSession
        return true
    }

    // Ask for notification permission in the strongest form the current launch
    // allows. Foreground: request the real thing, so the user gets a prompt and
    // proper banners + sound. Background relaunch — which is exactly how the
    // FIRST share arrives if Dilla has never been opened — cannot present a
    // prompt, so fall back to provisional: quiet delivery beats none, and iOS
    // offers to promote it to prominent from the notification itself.
    //
    // Guarded on .notDetermined because requestAuthorization only ever prompts
    // in that state; asking for provisional unconditionally would record a
    // provisional grant and permanently lock the app out of loud notifications.
    private func requestNotificationAuthorization(canPrompt: Bool) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            let options: UNAuthorizationOptions = canPrompt
                ? [.alert, .sound]
                : [.alert, .sound, .provisional]
            center.requestAuthorization(options: options) { _, _ in }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        // iOS relaunched us in the background because the share upload finished.
        // Stash the handler and touch the session so its events get delivered.
        guard identifier == AppDelegate.uploadSessionId else { completionHandler(); return }
        backgroundCompletion = completionHandler
        _ = uploadSession
    }

    // MARK: - Background upload receiver

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseBytes[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let data = responseBytes.removeValue(forKey: task.taskIdentifier)
        // The body file lived in the shared container until now; clean it up.
        if let path = task.taskDescription { try? FileManager.default.removeItem(atPath: path) }

        let outcome = AppDelegate.outcome(data: data, response: task.response, error: error)
        let content = UNMutableNotificationContent()
        content.title = outcome.title
        content.body = outcome.body
        content.sound = .default

        // Hold the "you may suspend me" signal (urlSessionDidFinishEvents) open
        // until this notification is actually registered — otherwise iOS can
        // suspend us mid-handoff and silently drop it.
        notifyGroup.enter()
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        ) { [weak self] _ in
            self?.notifyGroup.leave()
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        notifyGroup.notify(queue: .main) { [weak self] in
            self?.backgroundCompletion?()
            self?.backgroundCompletion = nil
        }
    }

    // Turn submit.mjs's response into a notification title + body. Shared shape
    // with the Share Extension's own fast-path handler; keep the two in sync.
    static func outcome(data: Data?, response: URLResponse?, error: Error?) -> (title: String, body: String) {
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        // Trust the body only when it is actually submit.mjs's envelope — it
        // always carries a Bool \`ok\`. A platform error page (HTML, or a 5xx JSON
        // envelope of some other shape) must fall through to the status rules
        // rather than being read as a definitive answer; treating a missing \`ok\`
        // as false announced platform errors as recipe rejections.
        if let data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let ok = json["ok"] as? Bool {
            let serverStatus = (json["status"] as? String) ?? ""
            let message = json["message"] as? String
            if ok && serverStatus == "queued" {
                // Enqueued for the worker (e.g. a video reel) — not saved yet.
                return ("Working on it…", message ?? "Reading the recipe — it'll appear shortly.")
            }
            if ok {
                return ("Saved to Dilla", message ?? "Recipe saved to your library.")
            }
            return ("Dilla couldn't save that", message ?? "That share couldn't be imported.")
        }

        // A 4xx with no usable body is a real rejection.
        if (400...499).contains(statusCode) {
            return ("Dilla couldn't save that", "That share couldn't be imported — try a screenshot instead.")
        }

        // Transport error, 5xx, platform timeout, or an empty body: the server
        // never gave us an answer. Nothing is queued and nothing retries, so
        // don't promise the recipe will appear — but don't assert it failed
        // either, because the save may have landed before the response died.
        return ("Dilla couldn't confirm that save", "Open Dilla to check — if the recipe isn't there, share it again.")
    }

    // MARK: - Capacitor lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Now we can definitely present a prompt. Covers a first launch that
        // began in the background (where only provisional was possible) and any
        // launch where permission was never determined.
        requestNotificationAuthorization(canPrompt: true)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
`

// --- always-run patches (independent of whether the target exists) ----------
// These files are regenerated from templates by `npx cap add ios`, so they are
// re-ensured on EVERY run — putting them after the target-exists early-exit
// meant a regenerated ios/ silently lost them.

// 0. Push entitlement. Required for the worker to announce an async import (a
// video reel, a slow link-in-bio recovery) once the app is suspended — a local
// notification cannot fire then. MUST be "production": TestFlight and App Store
// builds both use Apple's production APNs, and a build entitled "development"
// fails at delivery with BadDeviceToken rather than at build time, which makes
// it a genuinely nasty thing to get wrong.
{
  const entitlements = resolve(root, 'ios/App/App/App.entitlements')
  let xml = readFileSync(entitlements, 'utf8')
  if (!xml.includes('aps-environment')) {
    xml = xml.replace(
      /<\/dict>\s*<\/plist>\s*$/,
      `	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`,
    )
    writeFileSync(entitlements, xml)
    console.log('Added aps-environment (push) to the app entitlements.')
  }
}

// 1. dilla:// URL scheme in the app Info.plist (deep links; harmless to keep).
{
  const appPlist = resolve(root, 'ios/App/App/Info.plist')
  let plist = readFileSync(appPlist, 'utf8')
  if (!plist.includes('CFBundleURLTypes')) {
    plist = plist.replace(
      /<\/dict>\s*<\/plist>\s*$/,
      `	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>${APP_BUNDLE}</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>dilla</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`,
    )
    writeFileSync(appPlist, plist)
    console.log('Added dilla:// URL scheme to the app Info.plist.')
  }
}

// 2. AppDelegate. It both requests notification permission (extensions can't;
// only the main app can) AND adopts the Share Extension's background upload
// session to post the "Saved to Dilla" notification when the import finishes.
// `npx cap add ios` regenerates this file from the Capacitor template, so if
// our marker is absent we overwrite it wholesale with the known-good version.
// ⚠️ Keep APP_DELEGATE below in sync with ios/App/App/AppDelegate.swift.
{
  const adPath = resolve(root, 'ios/App/App/AppDelegate.swift')
  const ad = readFileSync(adPath, 'utf8')
  if (!ad.includes('DILLA-SHARE-UPLOAD')) {
    writeFileSync(adPath, APP_DELEGATE)
    console.log('Rewrote AppDelegate with the Dilla share-upload receiver.')
  }
}

const proj = xcode.project(projPath)
proj.parseSync()

// --- always-run: the App Group bridge must be in the App target -------------
// SharedStorePlugin.swift lets the web layer write the per-user share key into
// the App Group so the Share Extension can read it. It is our own file, so
// `cap sync` never adds it — without this the project builds fine and the
// plugin is simply missing at runtime, which surfaces as every share failing to
// authenticate. Runs before the target-exists early-exit so a regenerated
// pbxproj re-acquires it.
{
  const unq = (s) => String(s ?? '').replace(/^"|"$/g, '')
  const groups = proj.hash.project.objects.PBXGroup || {}
  const targets = proj.pbxNativeTargetSection()
  const appKey = Object.keys(targets).find((k) => unq(targets[k]?.name) === 'App')

  // The App source group (path "App", the one holding AppDelegate.swift). The
  // file reference MUST live inside it: a Swift file added to the top level gets
  // sourceTree "<group>" with no parent path, which resolves to ios/App/<file>
  // — one directory too high — and the build fails with "Build input file cannot
  // be found". AppDelegate.swift resolves correctly precisely because it is a
  // child of this group.
  const appGroupKey = Object.keys(groups).find((gk) => {
    const g = groups[gk]
    return (
      g && typeof g === 'object' && unq(g.path) === 'App' &&
      (g.children || []).some((c) => String(c.comment ?? '').includes('AppDelegate.swift'))
    )
  })

  const inSources = Object.values(proj.hash.project.objects.PBXSourcesBuildPhase || {}).some(
    (ph) => ph && typeof ph === 'object' && (ph.files || []).some((f) => String(f.comment ?? '').includes('SharedStorePlugin.swift')),
  )
  const inAppGroup =
    appGroupKey && (groups[appGroupKey].children || []).some((c) => String(c.comment ?? '').includes('SharedStorePlugin.swift'))

  // Self-healing: only act when it is NOT already both compiled and correctly
  // placed. addSourceFile is called WITHOUT a group (the third arg wants a group
  // KEY, not the name 'App' — passing the name is what orphaned the reference),
  // then the reference is attached to the App group explicitly so the path
  // resolves to ios/App/App/SharedStorePlugin.swift.
  if (appKey && !(inSources && inAppGroup)) {
    let ref
    if (!inSources) {
      const file = proj.addSourceFile('SharedStorePlugin.swift', { target: appKey })
      ref = file?.fileRef
    }
    if (appGroupKey && !inAppGroup) {
      // Find the file reference uuid (from the add above, or an existing orphan).
      if (!ref) {
        const fileRefs = proj.hash.project.objects.PBXFileReference || {}
        ref = Object.keys(fileRefs).find((k) => String(fileRefs[k]?.name ?? fileRefs[k]?.path ?? '').includes('SharedStorePlugin.swift'))
      }
      if (ref) {
        groups[appGroupKey].children = groups[appGroupKey].children || []
        groups[appGroupKey].children.push({ value: ref, comment: 'SharedStorePlugin.swift' })
      }
    }
    writeFileSync(projPath, proj.writeSync())
    console.log('Ensured SharedStorePlugin.swift is compiled and in the App group.')
  }
}

// --- idempotency: bail if the target already exists ------------------------
// The parser stores names QUOTED ("ShareExtension"), so a raw === comparison
// silently misses and you get a duplicate target — which breaks the build.
const unquote = (s) => String(s ?? '').replace(/^"|"$/g, '')
const targets = proj.pbxNativeTargetSection()
for (const key of Object.keys(targets)) {
  const t = targets[key]
  if (t && typeof t === 'object' && unquote(t.name) === TARGET) {
    console.log(`${TARGET} target already present — nothing to do.`)
    process.exit(0)
  }
}

// --- create the target ------------------------------------------------------
// 'app_extension' gives the right product type + packaging (.appex).
const ext = proj.addTarget(TARGET, 'app_extension', GROUP_DIR, EXT_BUNDLE)

// Build phases. The Swift file is passed INTO the Sources phase here rather
// than added afterwards with addSourceFile(): an empty Sources phase compiles
// nothing, producing a .appex whose executable has no architectures — which
// App Store upload rejects with error 90085 ("Lipo failed to detect any
// architectures"). The app still archives and exports fine, so this only
// surfaces at the very last step.
proj.addBuildPhase(
  ['ShareViewController.swift'],
  'PBXSourcesBuildPhase',
  'Sources',
  ext.uuid,
  'app_extension',
  GROUP_DIR,
)
proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', ext.uuid)
proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', ext.uuid)

// A group so the files show up sensibly if the project is ever opened in Xcode.
const group = proj.addPbxGroup(
  ['ShareViewController.swift', 'Info.plist', 'ShareExtension.entitlements'],
  TARGET,
  GROUP_DIR,
)
// Hang it off the main group so it isn't orphaned.
const groups = proj.hash.project.objects.PBXGroup
for (const key of Object.keys(groups)) {
  if (groups[key].name === 'CustomTemplate' || groups[key].name === undefined) {
    if (groups[key].isa === 'PBXGroup' && Array.isArray(groups[key].children)) {
      const hasApp = groups[key].children.some((c) => c.comment === 'App')
      if (hasApp) {
        proj.addToPbxGroup(group.uuid, key)
        break
      }
    }
  }
}

// (The Swift file is already attached to the Sources phase above — calling
// addSourceFile here as well produced a duplicate PBXBuildFile entry without
// ever landing in the phase's files array.)

// --- build settings ---------------------------------------------------------
// Set on BOTH Debug and Release for the extension target only.
const configs = proj.pbxXCBuildConfigurationSection()
const extConfigListId = targets[ext.uuid].buildConfigurationList
const lists = proj.pbxXCConfigurationList()
const extConfigIds = lists[extConfigListId].buildConfigurations.map((c) => c.value)

for (const id of extConfigIds) {
  const s = configs[id].buildSettings
  s.PRODUCT_BUNDLE_IDENTIFIER = `"${EXT_BUNDLE}"`
  s.PRODUCT_NAME = `"${TARGET}"`
  s.INFOPLIST_FILE = `"${GROUP_DIR}/Info.plist"`
  s.CODE_SIGN_ENTITLEMENTS = `"${GROUP_DIR}/ShareExtension.entitlements"`
  s.IPHONEOS_DEPLOYMENT_TARGET = '15.0'
  s.SWIFT_VERSION = '5.0'
  s.TARGETED_DEVICE_FAMILY = '"1,2"'
  s.SKIP_INSTALL = 'YES' // extensions are embedded, never installed standalone
  s.CODE_SIGN_STYLE = 'Manual'
  s.MARKETING_VERSION = '1.0'
  s.CURRENT_PROJECT_VERSION = '1'
  // The generated template can point at a non-existent bridging header.
  delete s.SWIFT_OBJC_BRIDGING_HEADER
}

// The main app must declare the same App Group, or the extension writes into a
// container the app can't read.
const appTargetKey = Object.keys(targets).find((k) => unquote(targets[k]?.name) === 'App')
if (appTargetKey) {
  const appListId = targets[appTargetKey].buildConfigurationList
  for (const c of lists[appListId].buildConfigurations) {
    configs[c.value].buildSettings.CODE_SIGN_ENTITLEMENTS = '"App/App.entitlements"'
  }
}

// --- embed the .appex into the app ------------------------------------------
// NOTE: addTarget() ALREADY creates a "Copy Files" phase on the app target that
// copies ShareExtension.appex into PlugIns (dstSubfolderSpec 13). Adding an
// explicit "Embed App Extensions" phase here produced a SECOND copy of the same
// file to the same destination, which xcodebuild rejects with the opaque
// "error: Unexpected duplicate tasks". So we only add the phase if no copy
// phase is already embedding the .appex.
const copyPhases = proj.hash.project.objects.PBXCopyFilesBuildPhase || {}
const alreadyEmbedded = Object.keys(copyPhases).some((k) => {
  const phase = copyPhases[k]
  if (!phase || typeof phase !== 'object') return false
  if (String(phase.dstSubfolderSpec) !== '13') return false
  return (phase.files || []).some((f) => String(f.comment ?? '').includes(`${TARGET}.appex`))
})

if (!alreadyEmbedded) {
  proj.addBuildPhase(
    [`${TARGET}.appex`],
    'PBXCopyFilesBuildPhase',
    'Embed App Extensions',
    appTargetKey,
    'app_extension',
  )
}

// --- sanity check: every target must actually compile something -------------
// An extension target with an empty Sources phase still archives and exports
// happily, then gets rejected by App Store upload with error 90085 ("No
// architectures in the binary"). Fail here instead, where the cause is obvious.
{
  const srcPhases = proj.hash.project.objects.PBXSourcesBuildPhase || {}
  const allTargets = proj.pbxNativeTargetSection()
  for (const key of Object.keys(allTargets)) {
    const t = allTargets[key]
    if (!t || typeof t !== 'object' || !t.name) continue
    for (const ph of t.buildPhases || []) {
      const phase = srcPhases[ph.value]
      if (!phase || typeof phase !== 'object') continue
      if (!(phase.files || []).length) {
        console.error(
          `\n${unquote(t.name)} has an EMPTY Sources phase — the built binary would ` +
            `have no architectures and App Store upload would reject it (90085).`,
        )
        process.exit(1)
      }
    }
  }
}

writeFileSync(projPath, proj.writeSync())

// (URL-scheme and AppDelegate patches run in the always-run section at the top,
// so they survive an ios/ regeneration even when this target-creation half
// no-ops.)

console.log(`Added ${TARGET} target (${EXT_BUNDLE}) and embedded it into App.`)
