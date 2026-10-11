import Foundation

private final class IBERFITReplyRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = 0
    func record() { lock.lock(); completed += 1; lock.unlock() }
    func count() -> Int { lock.lock(); defer { lock.unlock() }; return completed }
}

@main
struct IBERFITHealthKitSingleReplySpec {
    static func main() {
        let recorder = IBERFITReplyRecorder()
        let reply = IBERFITHealthKitSingleReply<Int> { result in
            precondition((try? result.get()) != nil)
            recorder.record()
        }
        DispatchQueue.concurrentPerform(iterations: 200) { _ in
            reply.finish(.success(42))
        }
        precondition(recorder.count() == 1)
        let error: Result<Int, Error> = .failure(NSError(domain: "qa", code: 1))
        precondition(error.isFailure)
        let good: Result<Int, Error> = .success(42)
        precondition(!good.isFailure)
        print("HealthKit one-shot delivery: PASS")
    }
}
