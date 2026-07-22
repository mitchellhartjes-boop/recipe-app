import UIKit
import UserNotifications
import UniformTypeIdentifiers

// Dilla's Share Extension — a fire-and-forget importer.
//
// Flow: read the shared link or image, POST it straight to Dilla's submit
// endpoint (the same one the iOS Shortcut used, which saves directly and
// queues a background cover-image job), announce the outcome with a local
// notification, and dismiss. The user STAYS in Instagram throughout.
//
// This deliberately does NOT open the host app. Waking the host app from an
// extension was the source of the frozen-Instagram bugs: whichever order you
// call completeRequest() and openURL:, iOS is switching apps while the
// extension tears down, and Instagram can be left waiting on a context that
// never cleanly completed. No app switch — no freeze class at all.
class ShareViewController: UIViewController {

    private let endpoint = URL(string: "https://recipe-vault-mh.netlify.app/.netlify/functions/submit")!

    // Injected into this extension's Info.plist by CI (PlistBuddy) from the
    // SHORTCUT_TOKEN env var — never committed to the (public) repo. Local
    // checkouts have it empty, which is fine: builds only happen on CI.
    private var token: String {
        (Bundle.main.object(forInfoDictionaryKey: "DillaShortcutToken") as? String) ?? ""
    }

    private let card = UIView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
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
            finishWith(ok: false, message: "This build is missing its access token — reinstall from TestFlight.")
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
            finishWith(ok: false, message: "Video files aren't supported yet — share the reel's link instead.")
            return
        }
        finishWith(ok: false, message: "Nothing to import from that share.")
    }

    private func loadImage(_ provider: NSItemProvider) {
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, _ in
            guard let self else { return }
            guard let url, let data = try? Data(contentsOf: url) else {
                DispatchQueue.main.async { self.finishWith(ok: false, message: "Couldn't read that image.") }
                return
            }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/jpeg"
            self.submit(["image": data.base64EncodedString(), "type": mime])
        }
    }

    private func loadURL(_ provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
            guard let self else { return }
            let link = (item as? URL)?.absoluteString ?? (item as? String)
            if let link, !link.isEmpty {
                self.submit(["url": link])
            } else {
                DispatchQueue.main.async { self.finishWith(ok: false, message: "Nothing to import from that share.") }
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
                DispatchQueue.main.async { self.finishWith(ok: false, message: "Nothing to import from that share.") }
            }
        }
    }

    // MARK: - Network

    private func submit(_ body: [String: Any]) {
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: req) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if error != nil {
                    self.finishWith(ok: false, message: "Couldn't reach Dilla — check your connection and try again.")
                    return
                }
                var ok = false
                var message = "Something went wrong — try again."
                if let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    ok = (json["ok"] as? Bool) ?? false
                    message = (json["message"] as? String) ?? message
                }
                self.finishWith(ok: ok, message: message)
            }
        }.resume()
    }

    // MARK: - Outcome

    private func finishWith(ok: Bool, message: String) {
        spinner.stopAnimating()
        spinner.isHidden = true
        label.text = (ok ? "✓ " : "") + message

        // The notification is the durable feedback (the card lasts ~1.5s). It
        // shows even though Instagram is frontmost, because the notification
        // belongs to Dilla, not the foreground app. Requires the main app to
        // have requested permission (done in AppDelegate on first launch).
        let content = UNMutableNotificationContent()
        content.title = ok ? "Saved to Dilla" : "Dilla couldn't save that"
        content.body = message
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil),
            withCompletionHandler: nil
        )

        // Dismiss AFTER the user has had a beat to read the card. No app
        // switch happens here — completeRequest simply returns to Instagram.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }
}
