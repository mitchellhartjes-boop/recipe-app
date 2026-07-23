import UIKit
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
// scripts/add-share-extension.mjs, which rewrites it verbatim if `npx cap add
// ios` ever regenerates ios/ from the Capacitor template.

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, URLSessionDataDelegate {

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
        // Provisional authorization so the Share Extension's import can announce
        // its result even if the user has never opened Dilla (the whole point is
        // that they stay in Instagram). Provisional grants silently — no prompt —
        // and delivers quietly to Notification Center; iOS then lets the user
        // promote it to prominent from the first notification itself. A plain
        // [.alert,.sound] request cannot be granted from a background relaunch,
        // which is exactly when the first share arrives.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .provisional]) { _, _ in }
        // Touch the session so we adopt any upload the extension already started
        // (covers the case where the app is opened before the upload finishes).
        _ = uploadSession
        return true
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
                // Enqueued for the worker (e.g. a video reel) — not saved yet.
                return ("Working on it…", message)
            } else if ok {
                return ("Saved to Dilla", message)
            } else {
                return ("Dilla couldn't save that", message)
            }
        }
        // No parseable JSON. A 4xx is a real rejection; a 5xx / timeout / empty
        // body may just mean the import is still finishing server-side, so we
        // must NOT assert failure (that would prompt a duplicate re-share).
        if (400...499).contains(statusCode) {
            return ("Dilla couldn't save that", "That share couldn't be imported — try a screenshot instead.")
        }
        return ("Still importing…", "This one's taking a moment — it'll appear in Dilla shortly.")
    }

    // MARK: - Capacitor lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

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
