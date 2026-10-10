#if canImport(WatchConnectivity) && os(watchOS)
import Foundation
import WatchConnectivity

// WatchConnectivity callbacks may arrive off-main; HealthKit workout
// commands are serialized through the actor that owns the workout session.
@MainActor
final class IBERFITWatchRuntimeRelay: NSObject, WCSessionDelegate {
    private let telemetry: IBERFITWatchHealthKitTelemetry
    private let session = WCSession.default

    init(telemetry: IBERFITWatchHealthKitTelemetry) {
        self.telemetry = telemetry
        super.init()
        telemetry.onSample = { [weak self] sample in
            Task { @MainActor [weak self] in self?.send(sample: sample) }
        }
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
        switch action {
        case "start": try? telemetry.start()
        case "pause": telemetry.pause()
        case "resume": telemetry.resume()
        case "stop": telemetry.stop()
        default: break
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        guard message["type"] as? String == "command",
              let action = message["action"] as? String else { return }
        Task { @MainActor [weak self] in self?.handle(action: action) }
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}
}
#endif
