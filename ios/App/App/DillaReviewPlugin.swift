import Foundation
import UIKit
import Capacitor
import StoreKit

// Asks iOS to show the native App Store review sheet. Deliberately thin: all
// the "should we ask?" logic lives in the web layer (src/lib/reviewPrompt.ts)
// where the counters and guards are.
//
// Apple decides whether the sheet actually appears — it is rate limited to a
// few times a year and silently does nothing when throttled. That is why we
// resolve `requested` (we asked) rather than pretending to know it was shown,
// and why there is no custom fallback UI: App Review rejects apps that gate the
// prompt behind their own "enjoying the app?" sentiment question.
@objc(DillaReviewPlugin)
public class DillaReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DillaReviewPlugin"
    public let jsName = "DillaReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            else {
                // No active scene (backgrounded mid-flight) — skip silently.
                call.resolve(["requested": false])
                return
            }
            SKStoreReviewController.requestReview(in: scene)
            call.resolve(["requested": true])
        }
    }
}
