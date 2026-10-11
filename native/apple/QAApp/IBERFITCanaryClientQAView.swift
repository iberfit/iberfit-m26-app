#if DEBUG
import SwiftUI
import WebKit
import IBERFITWebBridge
import Foundation

// DEBUG QA ONLY. The exact Canary HTTPS origin holds the authenticated web
// session. No access token/client ID is ever delivered to HealthKit or native.
// A separate native tap authorizes exactly one local HealthKit read.
@MainActor
final class IBERFITAppleCanaryQAState: ObservableObject {
    @Published private(set) var status = "Inicia sesión en Canary. La lectura necesita autorización local independiente."
    @Published private(set) var isBusy = false
    private let reader = IBERFITIOSHealthKitDailyVitalsReader()
    private var oneReadApproved = false
    private var generation: UInt64 = 0
    weak var webView: WKWebView?

    static func trusted(_ url: URL?) -> Bool {
        guard let url,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return false }
        return parts.scheme?.lowercased() == "https"
            && parts.host?.lowercased() == "m26-canary.iberfit.cl"
            && parts.port == nil && parts.user == nil && parts.password == nil
    }

    func authorizeOnce() {
        guard !isBusy, let webView, Self.trusted(webView.url) else {
            status = "Abre primero la página segura de Canary."
            return
        }
        generation &+= 1
        let lease = generation
        oneReadApproved = false
        isBusy = true
        status = "Autorizando una lectura local. IBERFIT no recibe tus datos todavía."
        reader.requestExplicitDailyAccess { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self, self.generation == lease else { return }
                self.isBusy = false
                if case .success = result {
                    self.oneReadApproved = true
                    self.status = "Una lectura autorizada. Consulta Apple Salud desde la sección Dispositivos de Canary."
                } else {
                    self.status = "No se completó la autorización local. Revisa Apple Salud."
                }
            }
        }
    }

    func receiveRead(requestId: String, days: Int, in view: WKWebView) {
        guard webView === view, Self.trusted(view.url) else { return }
        guard oneReadApproved && !isBusy else {
            reply(requestId, error: "M26_APPLE_QA_LOCAL_APPROVAL_REQUIRED", to: view)
            return
        }
        oneReadApproved = false
        guard (1...7).contains(days) else {
            reply(requestId, error: "M26_APPLE_QA_REQUEST_INVALID", to: view)
            return
        }
        generation &+= 1
        let lease = generation
        isBusy = true
        status = "Consultando Apple Salud localmente, sin transferencia al servidor."
        let expectedView = ObjectIdentifier(view)
        reader.readDailyOnce(days: days) { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self, self.generation == lease,
                      let activeView = self.webView,
                      ObjectIdentifier(activeView) == expectedView,
                      Self.trusted(activeView.url)
                else { return }
                self.isBusy = false
                switch result {
                case .failure:
                    self.status = "La lectura no se completó. No hay registros enviados."
                    self.reply(requestId, error: "M26_APPLE_QA_HEALTH_READ_FAILED", to: activeView)
                case .success(let records):
                    self.status = "Lectura local completada. No se ha guardado ni sincronizado."
                    // Codable contains local samples and honest provenance flags,
                    // never Supabase auth, watches, token, or physical timestamps.
                    guard let data = try? JSONEncoder().encode(records),
                          let decoded = try? JSONSerialization.jsonObject(with: data),
                          let rows = decoded as? [[String: Any]]
                    else {
                        self.reply(requestId, error: "M26_APPLE_QA_RESPONSE_INVALID", to: activeView)
                        return
                    }
                    self.reply([
                        "schema": "iberfit.connected360.apple.qa.read.v1",
                        "requestId": requestId,
                        "provider": "apple_health",
                        "records": rows,
                        "readPermissionStatus": "not_disclosed",
                        "persisted": false,
                        "linked": false
                    ], to: activeView)
                }
            }
        }
    }

    private func reply(_ requestId: String, error: String, to view: WKWebView) {
        reply([
            "schema": "iberfit.connected360.apple.qa.error.v1",
            "requestId": requestId, "error": error
        ], to: view)
    }

    private func reply(_ message: [String: Any], to view: WKWebView) {
        guard webView === view, Self.trusted(view.url),
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8)
        else { return }
        // Validate main-frame HTTPS origin again inside JS to fence a
        // navigation between the native check and evaluateJavaScript.
        let script = """
        (function(){
          if(location.origin!=='https://m26-canary.iberfit.cl')return;
          window.dispatchEvent(new CustomEvent(
            'iberfit:connected360-apple-qa',{detail:\(json)}));
        })();
        """
        view.evaluateJavaScript(script)
    }

    func invalidate() {
        generation &+= 1
        oneReadApproved = false
        isBusy = false
        reader.revokeLocalReadApproval()
        status = "Autorización local retirada. No se enviaron datos."
    }
}

struct IBERFITCanaryClientQAView: View {
    @StateObject private var state = IBERFITAppleCanaryQAState()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button("Autorizar UNA lectura local", action: state.authorizeOnce)
                    .disabled(state.isBusy)
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.73, green: 0.60, blue: 0.36))
                Text("QA")
                    .font(.caption.bold())
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            Text(state.status)
                .font(.caption)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.bottom, 8)
                .accessibilityAddTraits(.updatesFrequently)
            IBERFITCanaryQAWebView(state: state)
        }
        .background(Color(red: 0.95, green: 0.92, blue: 0.85))
        .onChange(of: phase) { _, newPhase in
            // .inactive includes HealthKit's own authorization sheet.
            if newPhase == .background { state.invalidate() }
        }
    }
}

private struct IBERFITCanaryQAWebView: UIViewRepresentable {
    @ObservedObject var state: IBERFITAppleCanaryQAState

    func makeCoordinator() -> Coordinator { Coordinator(state: state) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let content = WKUserContentController()
        content.add(context.coordinator, name: "iberfitConnected360AppleQa")
        config.userContentController = content
        config.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isInspectable = false
        context.coordinator.view = view
        state.webView = view
        view.load(URLRequest(url: URL(string: "https://m26-canary.iberfit.cl/m26/")!))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.state.invalidate()
        coordinator.state.webView = nil
        view.configuration.userContentController.removeScriptMessageHandler(
            forName: "iberfitConnected360AppleQa"
        )
        view.stopLoading()
        view.loadHTMLString("", baseURL: nil)
        view.navigationDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, @preconcurrency WKScriptMessageHandler {
        let state: IBERFITAppleCanaryQAState
        weak var view: WKWebView?
        private var seen = Set<String>()

        init(state: IBERFITAppleCanaryQAState) { self.state = state }

        func webView(_ webView: WKWebView,
                     decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.targetFrame?.isMainFrame != false,
               !IBERFITAppleCanaryQAState.trusted(action.request.url) {
                state.invalidate()
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView,
                     didStartProvisionalNavigation navigation: WKNavigation!) {
            seen.removeAll()
            state.invalidate()
        }

        func userContentController(
            _ controller: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard message.name == "iberfitConnected360AppleQa",
                  message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol.lowercased() == "https",
                  message.frameInfo.securityOrigin.host.lowercased() == "m26-canary.iberfit.cl",
                  let webView = message.webView,
                  webView === view,
                  IBERFITAppleCanaryQAState.trusted(webView.url),
                  let body = message.body as? [String: Any],
                  body.count <= 5,
                  let id = body["requestId"] as? String,
                  id.range(of: "^[A-Za-z0-9_-]{8,72}$", options: .regularExpression) != nil,
                  seen.insert(id).inserted,
                  body["schema"] as? String == "iberfit.connected360.apple.qa.request.v1",
                  let action = body["action"] as? String
            else { return }
            if seen.count > 128 { seen.removeAll(); seen.insert(id) }
            switch action {
            case "health.invalidate":
                // Web logout/account replacement retires the OS read lease.
                // No health data or authentication token is needed.
                state.invalidate()
            case "health.readDaily":
                guard let days = body["days"] as? Int,
                      (1...7).contains(days) else { return }
                state.receiveRead(requestId: id, days: days, in: webView)
            default:
                break
            }
        }
    }
}
#endif
