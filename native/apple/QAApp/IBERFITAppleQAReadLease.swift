import Foundation

/// Debug QA host only; monotonic elapsed time, never a server/device grant.
enum IBERFITAppleQAReadLease {
    static let maxAgeSeconds: TimeInterval = 120

    static func isCurrent(approvedAtUptime: TimeInterval?, nowUptime: TimeInterval) -> Bool {
        guard let approvedAtUptime, approvedAtUptime.isFinite, nowUptime.isFinite else {
            return false
        }
        let elapsed = nowUptime - approvedAtUptime
        return elapsed >= 0 && elapsed <= maxAgeSeconds
    }
}
