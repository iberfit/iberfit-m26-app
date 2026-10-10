#if canImport(WebKit) && os(iOS)
import Foundation
import WebKit

/// iPhone/iPad WKWebView transport for the RC52/RC53 JavaScript bridge.
@MainActor
final class IBERFITWebTelemetryEmitter {
    weak var webView: WKWebView?
    private let allowedHosts: Set<String>

    init(webView: WKWebView, allowedHosts: Set<String>) {
        precondition(!allowedHosts.isEmpty && !allowedHosts.contains("*"))
        self.allowedHosts = Set(allowedHosts.map { $0.lowercased() })
        self.webView = webView
    }

    func emit(sampleJSON: String) {
        guard let data = sampleJSON.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let wrapper = try? JSONSerialization.data(
                withJSONObject: ["type": "sample", "sample": object]
              ),
              let json = String(data: wrapper, encoding: .utf8)
        else { return }

        // Validate the destination twice: at native delivery time and inside
        // the page. A WKWebView can navigate after the sample was produced.
        guard let hostsData = try? JSONSerialization.data(
            withJSONObject: Array(allowedHosts).sorted()
        ), let hostsJSON = String(data: hostsData, encoding: .utf8)
        else { return }
        let script = "(function(){if(window.location.protocol!=='https:'" +
            "||!\(hostsJSON).includes(window.location.hostname.toLowerCase()))return;" +
            "window.dispatchEvent(new CustomEvent('iberfit:native-live-telemetry',{detail:" +
            json + "}));})();"
        // All WebKit access takes place on MainActor. The inline JS origin
        // check also protects navigation between evaluation and execution.
        guard let webView = self.webView,
              let url = webView.url,
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              self.allowedHosts.contains(host)
        else { return }
        webView.evaluateJavaScript(script)
    }
}

/// Receives commands sent by src/m26/wearables/native-transport.js.
final class IBERFITWebTelemetryCommandHandler: NSObject, WKScriptMessageHandler {
    var onCommand: ((String, [String: Any]) -> Void)?
    private let allowedHosts: Set<String>

    init(allowedHosts: Set<String>) {
        precondition(!allowedHosts.isEmpty)
        precondition(!allowedHosts.contains("*"))
        self.allowedHosts = Set(allowedHosts.map { $0.lowercased() })
        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        // Restrict commands to the HTTPS top-level IBERFIT document. Do not
        // grant an embedded iframe or a navigated WKWebView native privileges.
        guard message.name == "iberfitLiveTelemetry",
              message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol.lowercased() == "https",
              let webView = message.webView,
              let activeURL = webView.url,
              activeURL.scheme?.lowercased() == "https",
              let activeHost = activeURL.host?.lowercased(),
              activeHost == message.frameInfo.securityOrigin.host.lowercased(),
              allowedHosts.contains(activeHost),
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else { return }
        onCommand?(action, body)
    }
}
#endif
