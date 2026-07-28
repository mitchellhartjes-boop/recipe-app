import UIKit
import Capacitor

// Capacitor 8 does NOT auto-discover custom plugins that live in the app
// target — they must be registered on the bridge explicitly, from a
// CAPBridgeViewController subclass that the storyboard instantiates. Without
// this, SharedStore and DillaBrowser exist as compiled classes the JS bridge
// has never heard of: every call rejects with "plugin is not implemented on
// iOS". That silent failure is what broke the Share Extension key handoff
// (masked for weeks by the since-removed owner-token fallback).
class DillaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SharedStorePlugin())
        bridge?.registerPluginInstance(DillaBrowserPlugin())
    }
}
