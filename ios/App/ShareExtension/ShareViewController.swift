import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

// Dilla's iOS Share Extension.
//
// This is what puts "Dilla" in Instagram/Pinterest/Safari's share sheet. It runs
// as a SEPARATE PROCESS from the main app with a hard ~120 MB memory ceiling, so
// it deliberately does as little as possible: read the shared item, copy it into
// the shared App Group container, and hand off to the main app via a custom URL
// scheme. All extraction happens in the app, not here.
//
// Never render a WebView here — a Capacitor/RN UI in an extension has been
// measured at ~92 MB before touching any media, which leaves no headroom.
class ShareViewController: UIViewController {

    // Must match the App Group capability on BOTH targets.
    private let appGroupId = "group.com.mitchellhartjes.dilla"
    // Must match CFBundleURLSchemes in the main app's Info.plist.
    // The HOST must be "share": @capgo/capacitor-share-target only reacts to
    // url.host == "share" (or path "/share"). "dilla://shared" opened the app
    // but the plugin ignored it, so nothing was ever delivered.
    private let urlScheme = "dilla"
    private let urlHost = "share"
    // Key the @capgo/capacitor-share-target plugin reads on the app side.
    private let defaultsKey = "share-target-data"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleShare()
    }

    private func handleShare() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let attachments = item.attachments
        else { return finish() }

        var texts: [String] = []
        var files: [[String: String]] = []
        let group = DispatchGroup()

        for provider in attachments {
            // Order matters: check the most specific type first. A shared photo
            // can also advertise itself as data, and a URL often also comes
            // through as plain text — we want the richest interpretation.
            if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                group.enter()
                loadFile(provider, type: UTType.movie.identifier) { entry in
                    if let entry { files.append(entry) }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                group.enter()
                loadFile(provider, type: UTType.image.identifier) { entry in
                    if let entry { files.append(entry) }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                    if let url = data as? URL { texts.append(url.absoluteString) }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
                    if let s = data as? String { texts.append(s) }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.persist(texts: texts, files: files)
            self?.openHostApp()
        }
    }

    /// Copy a shared file into the App Group container.
    ///
    /// Two documented traps here:
    ///  1. The temp URL is transient — once the extension dies the file is gone,
    ///     so it must be copied somewhere the app can read.
    ///  2. The URL's extension can disagree with the file actually on disk, so
    ///     the path is used only for the copy, never trusted for the type.
    /// `loadFileRepresentation` streams to disk rather than loading into memory,
    /// which is what keeps a 100 MB video under the extension's RAM ceiling.
    private func loadFile(
        _ provider: NSItemProvider,
        type: String,
        completion: @escaping ([String: String]?) -> Void
    ) {
        provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, _ in
            guard
                let self,
                let url,
                let container = FileManager.default.containerURL(
                    forSecurityApplicationGroupIdentifier: self.appGroupId
                )
            else { return completion(nil) }

            let inbox = container.appendingPathComponent("share-inbox", isDirectory: true)
            try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)

            let ext = url.pathExtension.isEmpty ? "dat" : url.pathExtension
            let dest = inbox.appendingPathComponent("\(UUID().uuidString).\(ext)")

            do {
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.copyItem(at: url, to: dest)
                completion([
                    "uri": dest.absoluteString,
                    "name": dest.lastPathComponent,
                    "mimeType": self.mimeType(for: ext),
                ])
            } catch {
                completion(nil)
            }
        }
    }

    private func mimeType(for ext: String) -> String {
        if let type = UTType(filenameExtension: ext), let mime = type.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }

    /// Hand the payload to the main app through the shared UserDefaults suite.
    private func persist(texts: [String], files: [[String: String]]) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        let payload: [String: Any] = [
            "title": "",
            "texts": texts,
            "files": files,
        ]
        defaults.set(payload, forKey: defaultsKey)
        defaults.synchronize()
    }

    /// Wake the host app. An extension can't call UIApplication.shared.open, so
    /// this walks the responder chain to find something that can.
    ///
    /// Ordering matters: completeRequest() must come AFTER the open call has
    /// been dispatched, and the host app is opened via openURL:options:
    /// completionHandler so we finish only once iOS has taken the request.
    /// Calling finish() synchronously right after open() tore the extension
    /// down mid-handoff, which left the *sharing* app (Instagram) waiting on an
    /// extension context that never completed — it appeared frozen.
    private func openHostApp() {
        guard let url = URL(string: "\(urlScheme)://\(urlHost)") else { return finish() }

        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(url, options: [:]) { [weak self] _ in
                    self?.finish()
                }
                return
            }
            responder = r.next
        }

        // No UIApplication in the chain (possible on newer iOS): fall back to
        // the private-but-standard selector, then always complete the request
        // so the host app is never left hanging.
        let selector = NSSelectorFromString("openURL:")
        var target: UIResponder? = self
        while let t = target {
            if t.responds(to: selector) {
                t.perform(selector, with: url)
                break
            }
            target = t.next
        }
        finish()
    }

    private func finish() {
        // Always completes — an extension that never calls this leaves the
        // sharing app spinning.
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
