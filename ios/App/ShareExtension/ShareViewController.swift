import UIKit
import UserNotifications
import UniformTypeIdentifiers
import ImageIO

// Dilla's Share Extension — a true fire-and-forget importer.
//
// The user shares a link or image; the extension hands the upload to the OS via
// a BACKGROUND URLSession and dismisses in about a second, returning them to
// Instagram. iOS finishes the upload even after this extension is gone, then
// wakes the Dilla app to post a "Saved to Dilla" notification (see AppDelegate).
//
// Why background rather than a request held open: a share extension is a modal
// over the host app. Holding it open for a 10–20s extraction traps the user in
// the share sheet. Handing off and dismissing keeps them in Instagram — exactly
// what was asked for — and never opens Dilla (the app switch was the source of
// the earlier Instagram-freeze bugs, so there is no app switch at all now).

private let kUploadSessionId = "com.mitchellhartjes.dilla.share-upload"
private let kAppGroupId = "group.com.mitchellhartjes.dilla"
private let kEndpoint = URL(string: "https://recipe-vault-mh.netlify.app/.netlify/functions/submit")!

// A process-wide delegate for the extension's background session. It exists so
// that a response arriving BEFORE the extension dismisses (e.g. a fast auth
// error) is still handled and announced — a delegate:nil session would drop it,
// and the app would not be relaunched because a process was already connected.
// It is a singleton (not the view controller) so a reused extension process
// never rebinds the session to a dead controller, and so the session — which
// retains its delegate — retains only this tiny object.
final class ShareUploadHandler: NSObject, URLSessionDataDelegate {
    static let shared = ShareUploadHandler()
    private override init() { super.init() }

    lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.background(withIdentifier: kUploadSessionId)
        cfg.sharedContainerIdentifier = kAppGroupId
        cfg.sessionSendsLaunchEvents = true // relaunch the app to finish + notify
        cfg.isDiscretionary = false         // send now, not "when convenient"
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    private var responseBytes: [Int: Data] = [:]

    // Notifications posted but not yet registered with the notification daemon.
    // The view controller waits on this before dismissing, because once
    // completeRequest() runs iOS tears this process down and an in-flight
    // registration is simply lost — the app is NOT relaunched to retry, since
    // this process already consumed the task's completion event.
    let pendingNotifications = DispatchGroup()

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseBytes[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let data = responseBytes.removeValue(forKey: task.taskIdentifier)
        let outcome = ShareOutcome.make(data: data, response: task.response, error: error)
        postNotification(title: outcome.title, body: outcome.body)
        // Delete the payload only after the result is registered — if we are
        // killed first, the file survives for sweepOldPayloads rather than
        // disappearing along with the notification.
        pendingNotifications.notify(queue: .global(qos: .utility)) {
            if let path = task.taskDescription { try? FileManager.default.removeItem(atPath: path) }
        }
    }
}

// Turn submit.mjs's response into a notification title + body. This mirrors
// AppDelegate.outcome(...) exactly — the app handles the (usual) slow case after
// relaunch; this handles the fast case in-process. Keep the two in sync.
enum ShareOutcome {
    static func make(data: Data?, response: URLResponse?, error: Error?) -> (title: String, body: String) {
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        if let data,
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let ok = json["ok"] as? Bool {
            let serverStatus = (json["status"] as? String) ?? ""
            let message = json["message"] as? String
            if ok && serverStatus == "queued" {
                return ("Working on it…", message ?? "Reading the recipe — it'll appear shortly.")
            }
            if ok {
                return ("Saved to Dilla", message ?? "Recipe saved to your library.")
            }
            return ("Dilla couldn't save that", message ?? "That share couldn't be imported.")
        }
        if (400...499).contains(statusCode) {
            return ("Dilla couldn't save that", "That share couldn't be imported — try a screenshot instead.")
        }
        return ("Dilla couldn't confirm that save", "Open Dilla to check — if the recipe isn't there, share it again.")
    }
}

private func postNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    // Registration is async; track it so dismissal can wait for it rather than
    // tearing the extension down mid-handoff and dropping the notification.
    let pending = ShareUploadHandler.shared.pendingNotifications
    pending.enter()
    UNUserNotificationCenter.current().add(
        UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    ) { _ in pending.leave() }
}

// Dismiss the share sheet, but never before an in-flight notification has been
// registered. Bounded: the worst case is a slightly slower dismissal, never a
// sheet stuck open.
private func completeAfterPendingNotifications(_ context: NSExtensionContext?, delay: TimeInterval) {
    DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + delay) {
        _ = ShareUploadHandler.shared.pendingNotifications.wait(timeout: .now() + 1.5)
        DispatchQueue.main.async {
            context?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }
}

class ShareViewController: UIViewController {

    // Who is importing: ONLY the per-user share key the app writes into the
    // App Group on sign-in. There is deliberately no fallback — the old
    // build-wide token mapped to the owner's account, which meant any share
    // made before the key existed (fresh install, just switched accounts, a
    // failed key write) silently filed someone else's recipe into the owner's
    // library. No key now means a clear "open Dilla first" message instead.
    private var token: String {
        UserDefaults(suiteName: kAppGroupId)?.string(forKey: "dilla-share-key") ?? ""
    }

    private let card = UIView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        sweepOldPayloads()
        buildCard()
        handleShare()
    }

    // MARK: - Minimal in-sheet UI (a small "Saving to Dilla…" card)

    private func buildCard() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)

        card.backgroundColor = .systemBackground
        card.layer.cornerRadius = 16
        card.layer.shadowColor = UIColor.black.cgColor
        card.layer.shadowOpacity = 0.15
        card.layer.shadowRadius = 12
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(spinner)

        label.text = "Saving to Dilla…"
        label.font = .systemFont(ofSize: 15, weight: .medium)
        label.textColor = .label
        label.numberOfLines = 3
        label.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(label)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
            card.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            card.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32),
            spinner.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            spinner.centerYAnchor.constraint(equalTo: card.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: spinner.trailingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            label.topAnchor.constraint(equalTo: card.topAnchor, constant: 14),
            label.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14),
        ])
    }

    // MARK: - Share handling

    private func handleShare() {
        guard !token.isEmpty else {
            failFast("Open Dilla and sign in first — then sharing saves to your account.")
            return
        }

        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []

        // Priority: image (screenshot flow) > URL > plain text > movie.
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) {
            loadImage(p)
            return
        }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            loadURL(p)
            return
        }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            loadText(p)
            return
        }
        if providers.contains(where: { $0.hasItemConformingToTypeIdentifier(UTType.movie.identifier) }) {
            failFast("Video files aren't supported yet — share the reel's link instead.")
            return
        }
        failFast("Nothing to import from that share.")
    }

    private func loadImage(_ provider: NSItemProvider) {
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, _ in
            guard let self else { return }
            guard let url, let raw = try? Data(contentsOf: url) else {
                self.failFast("Couldn't read that image.")
                return
            }
            // Re-encode to a JPEG that is (a) a media type the vision model
            // accepts — the shared file can be HEIC, which it cannot decode — and
            // (b) small enough to stay under the server's request-body limit;
            // a full-res photo base64-encodes past it. Downscale the long edge.
            guard let jpeg = Self.jpegForUpload(raw) else {
                self.failFast("Couldn't read that image.")
                return
            }
            self.submit(["image": jpeg.base64EncodedString(), "type": "image/jpeg"])
        }
    }

    // Downscale to a 2048px long edge → JPEG at 0.8. Uses ImageIO thumbnailing,
    // which scales straight from the source WITHOUT fully decoding the original
    // into memory — important because a share extension has a ~120MB ceiling and
    // a full-resolution photo (e.g. 48MP) would blow it if decoded whole. Also
    // normalizes HEIC to JPEG (the vision model can't decode HEIC) and applies
    // the EXIF orientation so the extractor sees the page upright.
    private static func jpegForUpload(_ data: Data, maxEdge: CGFloat = 2048) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, // honor EXIF orientation
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,     // caps the long edge; never upscales
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let image = UIImage(cgImage: cg)

        // JPEG carries no alpha. Encoding a transparent PNG directly composites
        // it onto BLACK, which can bury dark recipe text; flatten onto white
        // instead. Only pay for the extra pass when there is actually alpha.
        let alpha = cg.alphaInfo
        let hasAlpha = !(alpha == .none || alpha == .noneSkipLast || alpha == .noneSkipFirst)
        guard hasAlpha else { return image.jpegData(compressionQuality: 0.8) }

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let bounds = CGRect(origin: .zero, size: image.size)
        return UIGraphicsImageRenderer(size: image.size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(bounds)
            image.draw(in: bounds)
        }.jpegData(compressionQuality: 0.8)
    }

    private func loadURL(_ provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
            guard let self else { return }
            let link = (item as? URL)?.absoluteString ?? (item as? String)
            if let link, !link.isEmpty {
                self.submit(["url": link])
            } else {
                self.failFast("Nothing to import from that share.")
            }
        }
    }

    private func loadText(_ provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
            guard let self else { return }
            if let text = item as? String, !text.isEmpty {
                // submit.mjs pulls the first http(s) URL out of shared text itself.
                self.submit(["url": text])
            } else {
                self.failFast("Nothing to import from that share.")
            }
        }
    }

    // MARK: - Hand off to the OS

    private func submit(_ body: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: body),
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: kAppGroupId) else {
            failFast("Couldn't prepare that share — try again.")
            return
        }
        // Background uploads take a file body, not an in-memory one. Write the
        // payload into the shared App Group container the app can also see.
        let fileURL = container.appendingPathComponent("share-\(UUID().uuidString).json")
        do {
            try jsonData.write(to: fileURL, options: .atomic)
        } catch {
            failFast("Couldn't prepare that share — try again.")
            return
        }

        var req = URLRequest(url: kEndpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let task = ShareUploadHandler.shared.session.uploadTask(with: req, fromFile: fileURL)
        // Record the payload path so whichever process finishes the task (this
        // extension, or the app after relaunch) can delete the file afterwards.
        task.taskDescription = fileURL.path
        task.resume() // OS owns the transfer now; it survives this extension.

        handedOff()
    }

    // MARK: - Outcome

    // Upload accepted by the OS: confirm briefly, then dismiss to Instagram. The
    // result notification is posted by whichever process sees the response — the
    // app after relaunch (the usual, slow case), or ShareUploadHandler here (a
    // fast response that beats this dismissal).
    private func handedOff() {
        DispatchQueue.main.async {
            self.spinner.stopAnimating()
            self.spinner.isHidden = true
            self.label.text = "Saving to Dilla — it'll be in your library shortly."
            completeAfterPendingNotifications(self.extensionContext, delay: 1.2)
        }
    }

    // A local error BEFORE hand-off (missing token, unreadable share, video
    // file). The app won't be woken for these, so notify from here and dismiss.
    private func failFast(_ message: String) {
        DispatchQueue.main.async {
            self.spinner.stopAnimating()
            self.spinner.isHidden = true
            self.label.text = message
            postNotification(title: "Dilla couldn't save that", body: message)
            completeAfterPendingNotifications(self.extensionContext, delay: 1.6)
        }
    }

    // Remove leftover payload files that no longer belong to a live upload. Files
    // are normally deleted the moment their task completes (see the delegate and
    // AppDelegate); this is a last-resort GC, so the cutoff is well beyond the
    // background session's resource timeout — deleting a still-queued upload's
    // body (e.g. shared while offline) would make that transfer fail.
    private func sweepOldPayloads() {
        let fm = FileManager.default
        guard let container = fm.containerURL(forSecurityApplicationGroupIdentifier: kAppGroupId),
              let files = try? fm.contentsOfDirectory(at: container, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let cutoff = Date().addingTimeInterval(-8 * 24 * 3600) // 8 days
        for f in files where f.lastPathComponent.hasPrefix("share-") && f.pathExtension == "json" {
            let modified = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            if let modified, modified < cutoff {
                try? fm.removeItem(at: f)
            }
        }
    }
}
