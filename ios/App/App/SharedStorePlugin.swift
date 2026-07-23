import Foundation
import Capacitor

// Writes small values into the App Group container so the Share Extension can
// read them. Nothing else can do this: the web layer's storage lives in the
// WebView, which the extension — a separate process with its own sandbox —
// cannot see. The App Group is the only channel between them.
//
// Used for the per-user share key. The extension needs to prove WHICH user is
// importing, and it has no Supabase session of its own, so the app mints a key
// and drops it here for the extension to pick up.
//
// Values are small identifiers, not bulk data; UserDefaults is the right size of
// tool. Note this is NOT the keychain — an App Group UserDefaults suite is
// readable by anything in the group (just our two targets), which is the point.
@objc(SharedStorePlugin)
public class SharedStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedStorePlugin"
    public let jsName = "SharedStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let suiteName = "group.com.mitchellhartjes.dilla"

    private func defaults(_ call: CAPPluginCall) -> UserDefaults? {
        guard let d = UserDefaults(suiteName: suiteName) else {
            // Only happens if the App Group entitlement is missing or misspelled,
            // which is a build-configuration error worth surfacing loudly rather
            // than silently no-oping into a broken share flow.
            call.reject("App Group \(suiteName) is unavailable — check the entitlement.")
            return nil
        }
        return d
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key is required")
            return
        }
        guard let value = call.getString("value") else {
            call.reject("value is required")
            return
        }
        guard let d = defaults(call) else { return }
        d.set(value, forKey: key)
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key is required")
            return
        }
        guard let d = defaults(call) else { return }
        d.removeObject(forKey: key)
        call.resolve()
    }
}
