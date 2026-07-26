import Foundation
import Capacitor
import WebKit

// The Discover tab's browser: presents the platform's OWN website (TikTok /
// Pinterest / Instagram search) full-screen with one persistent affordance —
// "Save this recipe" — which hands the current page URL back to the web layer
// to run the normal import pipeline.
//
// Why native and not an <iframe>: every one of these sites sends
// X-Frame-Options / frame-ancestors that block framing, so the only way to
// show them inside the app is a real WKWebView presented over the bridge.
//
// Review posture matters here: this is a browser displaying the platform's own
// public website (the user can log in, scroll, play videos — we render nothing
// of theirs in our own UI), plus a user-initiated import of the page they are
// looking at. Same posture as the share extension.
@objc(DillaBrowserPlugin)
public class DillaBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DillaBrowserPlugin"
    public let jsName = "DillaBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private weak var browser: DillaBrowserViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              url.scheme == "https" || url.scheme == "http" else {
            call.reject("A valid http(s) url is required")
            return
        }
        DispatchQueue.main.async {
            // Reuse the existing sheet if one is up — just steer it.
            if let existing = self.browser {
                existing.load(url)
                call.resolve()
                return
            }
            let vc = DillaBrowserViewController(url: url)
            vc.onSave = { [weak self] currentUrl in
                self?.notifyListeners("saveRequested", data: ["url": currentUrl?.absoluteString ?? ""])
            }
            vc.onClose = { [weak self] in
                self?.notifyListeners("browserClosed", data: [:])
            }
            vc.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(vc, animated: true)
            self.browser = vc
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.browser?.dismiss(animated: true)
            self.browser = nil
            call.resolve()
        }
    }
}

final class DillaBrowserViewController: UIViewController, WKNavigationDelegate {
    var onSave: ((URL?) -> Void)?
    var onClose: (() -> Void)?

    private let initialUrl: URL
    private var webView: WKWebView!

    init(url: URL) {
        self.initialUrl = url
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        // Persistent data store on purpose: if the user logs into Instagram or
        // Pinterest inside this browser, the session survives reopening — this
        // is their browser session in our app, exactly like Safari.
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // --- bottom bar: [close] [back]  [Save this recipe] -----------------
        let bar = UIView()
        bar.backgroundColor = .systemBackground
        bar.layer.shadowColor = UIColor.black.cgColor
        bar.layer.shadowOpacity = 0.08
        bar.layer.shadowRadius = 8
        bar.layer.shadowOffset = CGSize(width: 0, height: -2)
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark"), for: .normal)
        close.tintColor = .secondaryLabel
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(close)

        let back = UIButton(type: .system)
        back.setImage(UIImage(systemName: "chevron.backward"), for: .normal)
        back.tintColor = .secondaryLabel
        back.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        back.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(back)

        let save = UIButton(type: .system)
        save.setTitle("Save this recipe", for: .normal)
        save.setTitleColor(.white, for: .normal)
        save.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        // Dilla paprika — matches the app's primary button.
        save.backgroundColor = UIColor(red: 154/255, green: 52/255, blue: 18/255, alpha: 1)
        save.layer.cornerRadius = 14
        save.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        save.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(save)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bar.topAnchor),

            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -64),

            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.centerYAnchor.constraint(equalTo: bar.topAnchor, constant: 32),
            close.widthAnchor.constraint(equalToConstant: 32),
            close.heightAnchor.constraint(equalToConstant: 32),

            back.leadingAnchor.constraint(equalTo: close.trailingAnchor, constant: 8),
            back.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            back.widthAnchor.constraint(equalToConstant: 32),
            back.heightAnchor.constraint(equalToConstant: 32),

            save.leadingAnchor.constraint(equalTo: back.trailingAnchor, constant: 12),
            save.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            save.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            save.heightAnchor.constraint(equalToConstant: 44),
        ])

        webView.load(URLRequest(url: initialUrl))
    }

    func load(_ url: URL) {
        webView.load(URLRequest(url: url))
    }

    @objc private func closeTapped() {
        dismiss(animated: true) { self.onClose?() }
    }

    @objc private func backTapped() {
        if webView.canGoBack { webView.goBack() }
    }

    @objc private func saveTapped() {
        let current = webView.url
        dismiss(animated: true) { self.onSave?(current) }
    }
}
