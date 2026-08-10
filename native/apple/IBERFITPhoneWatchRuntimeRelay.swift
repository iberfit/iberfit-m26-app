#if canImport(WatchConnectivity) && canImport(WebKit) && os(iOS)
import Foundation
import WatchConnectivity
import WebKit

final class IBERFITPhoneWatchRuntimeRelay: NSObject, WCSessionDelegate {
    private let session = WCSession.default
    private let emitter: IBERFITWebTelemetryEmitter
    var onReachabilityChanged: ((Bool) -> Void)?

    init(emitter: IBERFITWebTelemetryEmitter) {
        self.emitter = emitter
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    var isReachable: Bool {
        session.activationState == .activated && session.isReachable
    }

    @discardableResult
    func sendCommand(_ action: String, executionId: String?) -> Bool {
        guard isReachable else { return false }
        var message: [String: Any] = ["type": "command", "action": action]
        if let executionId { message["executionId"] = executionId }
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        return true
    }

    private func emit(message: [String: Any]) {
        guard message["type"] as? String == "sample",
              message["provider"] as? String == "apple_health",
              let bpm = message["heartRateBpm"] as? Double,
              bpm >= 25, bpm <= 240,
              JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8)
        else { return }
        emitter.emit(sampleJSON: json)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        emit(message: message)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        onReachabilityChanged?(isReachable)
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        onReachabilityChanged?(isReachable)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
#endif
