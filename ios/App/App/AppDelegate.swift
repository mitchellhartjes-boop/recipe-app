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

    // Foreground launches no longer prompt from here: a cold-start system
    // dialog was the very first thing a new user saw, before anything had
    // explained why Dilla wants notifications. Onboarding now asks in context
    // (through the push plugin) on the slide that explains them. This path only
    // handles the BACKGROUND relaunch — the first share arriving before the app
    // was ever opened — where no prompt can show; provisional grants quietly so
    // that notification still lands.
    //
    // Guarded on .notDetermined because requestAuthorization only ever prompts
    // in that state; asking for provisional unconditionally would record a
    // provisional grant and permanently lock the app out of loud notifications.
    private func requestNotificationAuthorization(canPrompt: Bool) {
        guard !canPrompt else { return } // foreground: onboarding owns the ask
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .sound, .provisional]) { _, _ in }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    // handleApplicationNotifications is false (we own the UN delegate above), so
    // Capacitor does NOT forward these to @capacitor/push-notifications. Post the
    // notifications the plugin listens for ourselves — without this the plugin
    // never gets a device token and every push is silently undeliverable.
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
        // always carries a Bool `ok`. A platform error page (HTML, or a 5xx JSON
        // envelope of some other shape) must fall through to the status rules
        // rather than being read as a definitive answer; treating a missing `ok`
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
                return ("Recipe saved", message ?? "Recipe saved to your library.")
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
    func applicationDidBecomeActive(_ application: UIApplication) {}

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
