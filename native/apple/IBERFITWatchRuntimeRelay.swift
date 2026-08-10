#if canImport(WatchConnectivity) && os(watchOS)
import Foundation
import WatchConnectivity

final class IBERFITWatchRuntimeRelay: NSObject, WCSessionDelegate {
    private let telemetry: IBERFITWatchHealthKitTelemetry
    private let session = WCSession.default

    init(telemetry: IBERFITWatchHealthKitTelemetry) {
        self.telemetry = telemetry
        super.init()
        telemetry.onSample = { [weak self] sample in self?.send(sample: sample) }
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    private func send(sample: IBERFITWatchHealthKitTelemetry.Sample) {
        guard session.activationState == .activated, session.isReachable else { return }
        session.sendMessage([
            "type": "sample",
            "provider": sample.provider,
            "heartRateBpm": sample.heartRateBpm,
            "quality": sample.quality,
            "recordedAt": sample.recordedAt,
        ], replyHandler: nil, errorHandler: nil)
    }

    private func handle(action: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch action {
            case "start": try? self.telemetry.start()
            case "pause": self.telemetry.pause()
            case "resume": self.telemetry.resume()
            case "stop": self.telemetry.stop()
            default: break
            }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        guard message["type"] as? String == "command",
              let action = message["action"] as? String else { return }
        handle(action: action)
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}
}
#endif
