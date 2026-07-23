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

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, URLSessionDataDelegate {

    static let uploadSessionId = "com.mitchellhartjes.dilla.share-upload"
    static let appGroupId = "group.com.mitchellhartjes.dilla"

    var window: UIWindow?

    private var backgroundCompletion: (() -> Void)?
    private var responseBytes: [Int: Data] = [:]
    private let notifyGroup = DispatchGroup()

    private lazy var uploadSession: URLSession = {
        let cfg = URLSessionConfiguration.background(withIdentifier: AppDelegate.uploadSessionId)
        cfg.sharedContainerIdentifier = AppDelegate.appGroupId
        cfg.sessionSendsLaunchEvents = true
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .provisional]) { _, _ in }
        _ = uploadSession
        return true
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == AppDelegate.uploadSessionId else { completionHandler(); return }
        backgroundCompletion = completionHandler
        _ = uploadSession
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseBytes[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let data = responseBytes.removeValue(forKey: task.taskIdentifier)
        if let path = task.taskDescription { try? FileManager.default.removeItem(atPath: path) }

        let outcome = AppDelegate.outcome(data: data, response: task.response, error: error)
        let content = UNMutableNotificationContent()
        content.title = outcome.title
        content.body = outcome.body
        content.sound = .default

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

    static func outcome(data: Data?, response: URLResponse?, error: Error?) -> (title: String, body: String) {
        if error != nil {
            return ("Dilla couldn't save that", "Couldn't reach Dilla — check your connection and try again.")
        }
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        if let json {
            let ok = (json["ok"] as? Bool) ?? false
            let serverStatus = (json["status"] as? String) ?? ""
            let message = (json["message"] as? String) ?? "Recipe imported."
            if ok && serverStatus == "queued" {
                return ("Working on it…", message)
            } else if ok {
                return ("Saved to Dilla", message)
            } else {
                return ("Dilla couldn't save that", message)
            }
        }
        if (400...499).contains(statusCode) {
            return ("Dilla couldn't save that", "That share couldn't be imported — try a screenshot instead.")
        }
        return ("Still importing…", "This one's taking a moment — it'll appear in Dilla shortly.")
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
`

// --- always-run patches (independent of whether the target exists) ----------
// These files are regenerated from templates by `npx cap add ios`, so they are
// re-ensured on EVERY run — putting them after the target-exists early-exit
// meant a regenerated ios/ silently lost them.

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
