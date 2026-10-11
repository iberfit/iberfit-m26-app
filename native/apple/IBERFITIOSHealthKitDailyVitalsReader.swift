#if canImport(HealthKit) && os(iOS)
import Foundation
import HealthKit

/// HealthKit local-only QA reader for daily steps and resting heart rate.
/// One explicit system authorization precedes one bounded read. Neither
/// a successful authorization callback nor a sensor reading certifies a watch.
/// No WebKit transport, server access, storage, or background execution.
public final class IBERFITIOSHealthKitDailyVitalsReader: @unchecked Sendable {
    public struct DailyVitals: Sendable, Codable {
        public let provider: String
        public let date: String
        public let steps: Int?
        public let restingHeartRate: Int?
        public let aggregationTimeZone: String
        public let acquiredAt: String
        public let sourceTimestampVerified: Bool
        public let automaticSyncCertified: Bool
    }

    public enum ReaderError: Error {
        case unavailable
        case invalidWindow
        case explicitApprovalRequired
        case noResult
        case invalidated
    }

    private let healthStore = HKHealthStore()
    private let fence = NSLock()
    private var generation: UInt64 = 0
    private var oneReadApproved = false

    /// A successful callback only means the HealthKit permission sheet
    /// completed. Apple does not disclose denied READ permissions in status.
    /// An empty query means "missing or denied", never numeric zero.
    public func requestExplicitDailyAccess(
        completion: @escaping @Sendable (Result<Void, Error>) -> Void
    ) {
        fence.lock()
        generation &+= 1
        let lease = generation
        oneReadApproved = false
        fence.unlock()

        guard HKHealthStore.isHealthDataAvailable(),
              let steps = HKObjectType.quantityType(forIdentifier: .stepCount),
              let resting = HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        else {
            completion(.failure(ReaderError.unavailable))
            return
        }
        healthStore.requestAuthorization(
            toShare: Set<HKSampleType>(),
            read: Set<HKObjectType>([steps, resting])
        ) { [weak self] success, error in
            guard let self else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            self.fence.lock()
            let valid = self.generation == lease
            if valid && success && error == nil {
                self.oneReadApproved = true
            }
            self.fence.unlock()
            guard valid else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            if let error {
                completion(.failure(error))
            } else {
                completion(success ? .success(()) : .failure(ReaderError.unavailable))
            }
        }
    }

    public func readDailyOnce(
        days: Int,
        now: Date = Date(),
        completion: @escaping @Sendable (Result<[DailyVitals], Error>) -> Void
    ) {
        guard (1...7).contains(days) else {
            completion(.failure(ReaderError.invalidWindow))
            return
        }
        fence.lock()
        let allowed = oneReadApproved
        let lease = generation
        oneReadApproved = false
        fence.unlock()
        guard allowed else {
            completion(.failure(ReaderError.explicitApprovalRequired))
            return
        }
        guard HKHealthStore.isHealthDataAvailable(),
              let steps = HKObjectType.quantityType(forIdentifier: .stepCount),
              let resting = HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        else {
            completion(.failure(ReaderError.unavailable))
            return
        }
        var local = Calendar(identifier: .gregorian)
        local.timeZone = .current
        let calendar = local
        let anchor = calendar.startOfDay(for: now)
        guard let from = calendar.date(byAdding: .day, value: 1-days, to: anchor),
              let until = calendar.date(byAdding: .day, value: 1, to: anchor)
        else {
            completion(.failure(ReaderError.invalidWindow))
            return
        }

        // Serial aggregate queries reduce simultaneous HealthKit work on a
        // small phone and allow invalidated sessions to stop before query 2.
        queryDaily(
            type: steps, start: from, end: until, anchor: anchor,
            calendar: calendar, isSteps: true
        ) { [weak self] stepsResult in
            guard let self, self.isCurrent(lease) else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            switch stepsResult {
            case .failure(let error):
                completion(.failure(error))
            case .success(let stepRows):
                self.queryDaily(
                    type: resting, start: from, end: until, anchor: anchor,
                    calendar: calendar, isSteps: false
                ) { [weak self] restingResult in
                    guard let self, self.isCurrent(lease) else {
                        completion(.failure(ReaderError.invalidated))
                        return
                    }
                    switch restingResult {
                    case .failure(let error):
                        completion(.failure(error))
                    case .success(let hrRows):
                        let dates = Set(stepRows.keys).union(hrRows.keys).sorted()
                        let acquiredAt = ISO8601DateFormatter().string(from: Date())
                        let daily = dates.map { date in
                            DailyVitals(
                                provider: "apple_health",
                                date: date,
                                steps: stepRows[date],
                                restingHeartRate: hrRows[date],
                                aggregationTimeZone: calendar.timeZone.identifier,
                                acquiredAt: acquiredAt,
                                sourceTimestampVerified: false,
                                automaticSyncCertified: false
                            )
                        }
                        guard self.isCurrent(lease) else {
                            completion(.failure(ReaderError.invalidated))
                            return
                        }
                        completion(.success(daily))
                    }
                }
            }
        }
    }

    private func queryDaily(
        type: HKQuantityType,
        start: Date,
        end: Date,
        anchor: Date,
        calendar: Calendar,
        isSteps: Bool,
        completion: @escaping @Sendable (Result<[String: Int], Error>) -> Void
    ) {
        let options: HKStatisticsOptions = isSteps ? .cumulativeSum : .discreteAverage
        let predicate = HKQuery.predicateForSamples(
            withStart: start, end: end, options: .strictStartDate
        )
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: options,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { _, collection, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let collection else {
                completion(.failure(ReaderError.noResult))
                return
            }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = calendar.timeZone
            formatter.calendar = calendar
            formatter.dateFormat = "yyyy-MM-dd"
            let unit = isSteps ? HKUnit.count() :
                HKUnit.count().unitDivided(by: HKUnit.minute())
            var rows: [String: Int] = [:]
            collection.enumerateStatistics(from: start, to: end) { statistics, _ in
                guard statistics.startDate >= start, statistics.startDate < end,
                      let quantity = isSteps
                        ? statistics.sumQuantity()
                        : statistics.averageQuantity()
                else { return }
                let number = quantity.doubleValue(for: unit)
                guard number.isFinite, number >= (isSteps ? 0 : 25),
                      number <= (isSteps ? 200_000 : 240)
                else { return }
                rows[formatter.string(from: statistics.startDate)] = Int(number.rounded())
            }
            completion(.success(rows))
        }
        healthStore.execute(query)
    }

    public func revokeLocalReadApproval() {
        fence.lock()
        generation &+= 1
        oneReadApproved = false
        fence.unlock()
    }

    private func isCurrent(_ lease: UInt64) -> Bool {
        fence.lock()
        let current = generation == lease
        fence.unlock()
        return current
    }
}
#endif
