#if canImport(WebKit) && os(iOS)
import Foundation
import WebKit

final class IBERFITIOSNativeTelemetryRuntime {
    private let commandHandler: IBERFITWebTelemetryCommandHandler
    private let watchRelay: IBERFITPhoneWatchRuntimeRelay
    private let bleRuntime = IBERFITIOSBleHeartRateRuntime()
    private let emitter: IBERFITWebTelemetryEmitter
    private var executionId: String?
    private var active = false

    init(webView: WKWebView, allowedHosts: Set<String>) {
        emitter = IBERFITWebTelemetryEmitter(webView: webView)
        commandHandler = IBERFITWebTelemetryCommandHandler(allowedHosts: allowedHosts)
        watchRelay = IBERFITPhoneWatchRuntimeRelay(emitter: emitter)

        bleRuntime.onSample = { [weak emitter] sample in
            guard JSONSerialization.isValidJSONObject(sample),
                  let data = try? JSONSerialization.data(withJSONObject: sample),
                  let json = String(data: data, encoding: .utf8) else { return }
            emitter?.emit(sampleJSON: json)
        }

        commandHandler.onCommand = { [weak self] action, body in
            self?.handle(action: action, body: body)
        }
        watchRelay.onReachabilityChanged = { [weak self] reachable in
            self?.handleReachability(reachable)
        }
    }

    func install(in controller: WKUserContentController) {
        controller.add(commandHandler, name: "iberfitLiveTelemetry")
    }

    private func handle(action: String, body: [String: Any]) {
        let id = body["executionId"] as? String
        if action == "start" { executionId = id; active = true }
        if action == "stop" { active = false }

        if watchRelay.sendCommand(action, executionId: executionId) {
            if action == "start" { bleRuntime.stop() }
            return
        }

        switch action {
        case "start": bleRuntime.start()
        case "pause": bleRuntime.pause()
        case "resume": bleRuntime.resume()
        case "stop": bleRuntime.stop()
        default: break
        }
    }

    private func handleReachability(_ reachable: Bool) {
        guard active else { return }
        if reachable {
            bleRuntime.stop()
            _ = watchRelay.sendCommand("start", executionId: executionId)
        } else {
            bleRuntime.start()
        }
    }
}
#endif
