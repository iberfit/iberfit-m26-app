#if canImport(WebKit) && os(iOS)
import Foundation
import WebKit

/// iPhone/iPad WKWebView transport for the RC52/RC53 JavaScript bridge.
final class IBERFITWebTelemetryEmitter {
    weak var webView: WKWebView?

    init(webView: WKWebView) {
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

        let script = "window.dispatchEvent(new CustomEvent('iberfit:native-live-telemetry',{detail:" + json + "}));"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script)
        }
    }
}

/// Receives commands sent by src/m26/wearables/native-transport.js.
final class IBERFITWebTelemetryCommandHandler: NSObject, WKScriptMessageHandler {
    var onCommand: ((String, [String: Any]) -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "iberfitLiveTelemetry",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else { return }
        onCommand?(action, body)
    }
}
#endif
