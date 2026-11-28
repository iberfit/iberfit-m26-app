import Foundation

// Platform-neutral validation. IDs remain local to the native QA preview;
// neither workout UUIDs nor raw samples are sent to the web or server.
public struct IBERFITLocalWorkout: Sendable, Identifiable {
    public let id: UUID
    public let sport: String
    public let start: Date
    public let end: Date
    public let activeSeconds: Double
    public let distanceMeters: Double?
    public let averageHeartRate: Double?

    public init?(id: UUID, sport: String, start: Date, end: Date,
                 activeSeconds: Double, distanceMeters: Double?, averageHeartRate: Double? = nil, from: Date, until: Date) {
        let elapsed = end.timeIntervalSince(start)
        guard ["running","cycling","walking","strength","hiit","swimming","other"].contains(sport),
              start >= from, end <= until, elapsed.isFinite, elapsed > 0,
              elapsed <= 86_400, activeSeconds.isFinite, activeSeconds > 0,
              activeSeconds <= elapsed + 1 else { return nil }
        self.id = id
        self.sport = sport
        self.start = start
        self.end = end
        self.activeSeconds = activeSeconds
        self.averageHeartRate = averageHeartRate.flatMap {
            $0.isFinite && $0 >= 25 && $0 <= 240 ? $0 : nil
        }
        self.distanceMeters = distanceMeters.flatMap {
            $0.isFinite && $0 >= 0 && $0 <= 500_000 ? $0 : nil
        }
    }
}

public struct IBERFITLocalWorkoutPreview: Sendable {
    public let workouts: [IBERFITLocalWorkout]
    public let mayHaveMore: Bool
    public init(workouts: [IBERFITLocalWorkout], returnedCount: Int) {
        var ids = Set<UUID>()
        self.workouts = Array(workouts.sorted {
            $0.start == $1.start ? $0.id.uuidString < $1.id.uuidString : $0.start > $1.start
        }.filter { ids.insert($0.id).inserted }.prefix(60))
        self.mayHaveMore = returnedCount > 60
    }
}

// Separate candidate projection for V54. It is NOT used by the one-shot
// preview, does not send data, does not assert source identity, and contains
// no biometric data or raw HealthKit identifier. Persist only after a
// certified account-scoped consent and native import channel exist.
#if canImport(CryptoKit)
import CryptoKit

public struct IBERFITAppleWorkoutImportRow: Encodable, Sendable {
    public let observationKey: String
    public let sport: String
    public let startedAt: String
    public let endedAt: String
    public let activeSeconds: Double
    public let distanceMeters: Double?

    // Domain-separated stable pseudonym; not an anonymous identifier or
    // a cryptographic attestation of the device. No device-specific salt:
    // a retry or another phone reading the same HK UUID must not duplicate it.
    public init?(workout: IBERFITLocalWorkout) {
        let material = "iberfit:apple-health:exercise:v54:" + workout.id.uuidString.lowercased()
        self.observationKey = SHA256.hash(data: Data(material.utf8)).map {
            String(format: "%02x", Int($0))
        }.joined()
        let iso = ISO8601DateFormatter()
        iso.timeZone = TimeZone(secondsFromGMT: 0)
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let start = iso.string(from: workout.start)
        let end = iso.string(from: workout.end)
        guard let parsedStart = iso.date(from: start), let parsedEnd = iso.date(from: end),
              parsedEnd > parsedStart,
              parsedEnd.timeIntervalSince(parsedStart) <= 86_400,
              workout.activeSeconds <= parsedEnd.timeIntervalSince(parsedStart) + 1 else { return nil }
        self.sport = workout.sport
        self.startedAt = start
        self.endedAt = end
        self.activeSeconds = workout.activeSeconds
        self.distanceMeters = workout.distanceMeters
    }

    private enum CodingKeys: String, CodingKey {
        case observationKey, sport, startedAt, endedAt, activeSeconds, distanceMeters
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(observationKey, forKey: .observationKey)
        try c.encode(sport, forKey: .sport)
        try c.encode(startedAt, forKey: .startedAt)
        try c.encode(endedAt, forKey: .endedAt)
        try c.encode(activeSeconds, forKey: .activeSeconds)
        // V54 requires an explicit null instead of omitting the unknown field.
        if let distanceMeters { try c.encode(distanceMeters, forKey: .distanceMeters) }
        else { try c.encodeNil(forKey: .distanceMeters) }
    }
}
#endif

#if canImport(HealthKit) && os(iOS)
import HealthKit

/// Read-only, one-shot local QA; not a production or background bridge.
public final class IBERFITIOSHealthKitWorkoutReader: @unchecked Sendable {
    public init() {}
    public enum ReaderError: Error {
        case unavailable, approvalRequired, invalidWindow, invalidated, timedOut, noResult
    }
    private let store = HKHealthStore()
    private let lock = NSLock()
    private var generation: UInt64 = 0
    private var approvedAt: TimeInterval?
    private var heartRateApproved = false
    private func begin() -> UInt64 {
        lock.lock(); defer { lock.unlock() }
        generation &+= 1
        approvedAt = nil
        heartRateApproved = false
        return generation
    }
    private func current(_ lease: UInt64) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return generation == lease
    }
    private func approve(_ lease: UInt64, includeHeartRate: Bool) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard generation == lease else { return false }
        approvedAt = ProcessInfo.processInfo.systemUptime
        heartRateApproved = includeHeartRate
        return true
    }
    private func consume() -> (generation: UInt64, includeHeartRate: Bool)? {
        lock.lock(); defer { lock.unlock() }
        guard let at = approvedAt else { return nil }
        approvedAt = nil
        let age = ProcessInfo.processInfo.systemUptime - at
        let includeHeartRate = heartRateApproved
        heartRateApproved = false
        guard age >= 0 && age <= 120 else { return nil }
        return (generation, includeHeartRate)
    }
    private func retire(_ lease: UInt64) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard generation == lease else { return false }
        generation &+= 1
        approvedAt = nil
        heartRateApproved = false
        return true
    }
    public func invalidate() { _ = begin() }

    public func requestExplicitWorkoutAccess(includeHeartRate: Bool = false, completion: @escaping @Sendable (Result<Void, Error>) -> Void) {
        let lease = begin()
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(ReaderError.unavailable)); return
        }
        // Successful callback is not proof of granted read permission.
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        if includeHeartRate, let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) {
            types.insert(heartRate)
        }
        store.requestAuthorization(toShare: Set<HKSampleType>(), read: types) { [weak self] success, error in
            guard let self, self.current(lease) else {
                completion(.failure(ReaderError.invalidated)); return
            }
            if let error { completion(.failure(error)); return }
            guard success else { completion(.failure(ReaderError.unavailable)); return }
            completion(self.approve(lease, includeHeartRate: includeHeartRate) ? .success(()) : .failure(ReaderError.invalidated))
        }
    }

    public func readOnce(days: Int = 30, now: Date = Date(),
                         completion: @escaping @Sendable (Result<IBERFITLocalWorkoutPreview, Error>) -> Void) {
        guard (1...30).contains(days), now.timeIntervalSince1970.isFinite else {
            completion(.failure(ReaderError.invalidWindow)); return
        }
        guard let approval = consume() else { completion(.failure(ReaderError.approvalRequired)); return }
        let lease = approval.generation
        let includeHeartRate = approval.includeHeartRate
        let from = now.addingTimeInterval(-Double(days)*86_400)
        let predicate = HKQuery.predicateForSamples(withStart: from, end: now,
                                                    options: [.strictStartDate,.strictEndDate])
        let reply = IBERFITHealthKitSingleReply<IBERFITLocalWorkoutPreview>(completion)
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(),
            predicate: predicate, limit: 61,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) {
                [weak self] _, samples, error in
                guard let self, self.retire(lease) else {
                    reply.finish(.failure(ReaderError.invalidated)); return
                }
                if let error { reply.finish(.failure(error)); return }
                guard let workouts = samples as? [HKWorkout] else {
                    reply.finish(.failure(ReaderError.noResult)); return
                }
                let rows = workouts.compactMap { workout -> IBERFITLocalWorkout? in
                    let (sport, distanceType) = Self.sportAndDistance(workout.workoutActivityType)
                    let distance = distanceType.flatMap { HKObjectType.quantityType(forIdentifier: $0) }
                        .flatMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }
                    // Use only the workout's own associated statistic; no
                    // separate pulse query and no mixing with daily/resting HR.
                    let averageHeartRate = includeHeartRate
                        ? HKObjectType.quantityType(forIdentifier: .heartRate).flatMap {
                            workout.statistics(for: $0)?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                        } : nil
                    return IBERFITLocalWorkout(id: workout.uuid, sport: sport,
                        start: workout.startDate, end: workout.endDate, activeSeconds: workout.duration,
                        distanceMeters: distance, averageHeartRate: averageHeartRate, from: from, until: now)
                }
                reply.finish(.success(IBERFITLocalWorkoutPreview(workouts: rows, returnedCount: workouts.count)))
            }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 18) { [weak self] in
            guard let self, self.retire(lease) else { return }
            reply.finish(.failure(ReaderError.timedOut))
        }
        store.execute(query)
    }

    private static func sportAndDistance(_ type: HKWorkoutActivityType) -> (String, HKQuantityTypeIdentifier?) {
        switch type {
        case .running: return ("running", .distanceWalkingRunning)
        case .walking: return ("walking", .distanceWalkingRunning)
        case .cycling: return ("cycling", .distanceCycling)
        case .swimming: return ("swimming", .distanceSwimming)
        case .traditionalStrengthTraining, .functionalStrengthTraining: return ("strength", nil)
        case .highIntensityIntervalTraining: return ("hiit", nil)
        default: return ("other", nil)
        }
    }
}
#endif
