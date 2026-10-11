import Foundation

// A single terminal callback regardless of a HealthKit deadline/race.
final class IBERFITHealthKitSingleReply<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false
    private let callback: @Sendable (Result<Value, Error>) -> Void

    init(_ callback: @escaping @Sendable (Result<Value, Error>) -> Void) {
        self.callback = callback
    }

    func finish(_ result: Result<Value, Error>) {
        lock.lock()
        let shouldDeliver = !completed
        completed = true
        lock.unlock()
        if shouldDeliver { callback(result) }
    }
}

extension Result {
    var isFailure: Bool {
        if case .failure = self { return true }
        return false
    }
}

