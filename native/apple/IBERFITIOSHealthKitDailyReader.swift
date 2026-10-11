#if canImport(HealthKit) && os(iOS)
import Foundation
import HealthKit

/// Isolated iOS *local* HealthKit reader. Not a cloud account link, watch
/// identity attestation, or automatic/background synchronization.
/// The consuming signed iPhone target must enable HealthKit entitlements.
/// Never sends HealthKit records or a user token to the web app.
final class IBERFITIOSHealthKitDailyReader: @unchecked Sendable {
    struct DailySteps: Codable, Sendable {
        let provider: String
        let date: String
        let steps: Int
        let acquiredAt: String
        let aggregationTimeZone: String
        let sourceTimestampVerified: Bool
        let automaticSyncCertified: Bool
    }

    enum ReaderError: Error {
        case unavailable
        case invalidWindow
        case explicitApprovalRequired
        case statisticsUnavailable
        case invalidated
    }

    private let healthStore = HKHealthStore()
    private let fence = NSLock()
    private var oneReadApproved = false
    private var generation: UInt64 = 0

    /// A user-initiated HealthKit permission request; a successful system
    /// callback does NOT prove that the person allowed reading this datatype.
    /// HealthKit deliberately does not disclose read-denial through
    /// authorizationStatus(for:), which only reports sharing status.
    func requestExplicitStepsAccess(completion: @escaping (Result<Void, Error>) -> Void) {
        fence.lock()
        generation &+= 1
        let lease = generation
        oneReadApproved = false
        fence.unlock()
        guard HKHealthStore.isHealthDataAvailable(),
              let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)
        else {
            completion(.failure(ReaderError.unavailable))
            return
        }
        healthStore.requestAuthorization(
            toShare: Set<HKSampleType>(),
            read: Set<HKObjectType>([stepsType])
        ) { [weak self] success, error in
            guard let self else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            self.fence.lock()
            let current = self.generation == lease
            if current && success && error == nil {
                self.oneReadApproved = true
            }
            self.fence.unlock()
            guard current else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            if let error {
                completion(.failure(error))
            } else if !success {
                completion(.failure(ReaderError.unavailable))
            } else {
                completion(.success(()))
            }
        }
    }

    /// Consumes one local approval BEFORE querying, bounded to seven civil
    /// days. Dates use the phone's *aggregation* time zone, never a guessed
    /// physical Watch time zone. Missing HealthKit data remains missing.
    func readStepsOnce(
        days: Int,
        now: Date = Date(),
        completion: @escaping (Result<[DailySteps], Error>) -> Void
    ) {
        guard (1...7).contains(days) else {
            completion(.failure(ReaderError.invalidWindow))
            return
        }
        fence.lock()
        let permitted = oneReadApproved
        let lease = generation
        oneReadApproved = false
        fence.unlock()
        guard permitted else {
            completion(.failure(ReaderError.explicitApprovalRequired))
            return
        }
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount)
        else {
            completion(.failure(ReaderError.unavailable))
            return
        }

        var localCalendar = Calendar(identifier: .gregorian)
        localCalendar.timeZone = .current
        let calendar = localCalendar
        let today = calendar.startOfDay(for: now)
        guard let from = calendar.date(byAdding: .day, value: 1 - days, to: today),
              let until = calendar.date(byAdding: .day, value: 1, to: today)
        else {
            completion(.failure(ReaderError.invalidWindow))
            return
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: from, end: until, options: .strictStartDate
        )
        let query = HKStatisticsCollectionQuery(
            quantityType: stepType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: today,
            intervalComponents: DateComponents(day: 1)
        )

        query.initialResultsHandler = { [weak self] _, collection, error in
            guard let self, self.isCurrent(lease) else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            if let error {
                completion(.failure(error))
                return
            }
            guard let collection else {
                completion(.failure(ReaderError.statisticsUnavailable))
                return
            }
            let acquired = ISO8601DateFormatter().string(from: Date())
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = calendar.timeZone
            formatter.dateFormat = "yyyy-MM-dd"

            var records: [DailySteps] = []
            collection.enumerateStatistics(from: from, to: until) { stats, _ in
                guard stats.startDate >= from, stats.startDate < until,
                      let sum = stats.sumQuantity()
                else { return }
                let value = sum.doubleValue(for: .count())
                // Do not fabricate zero for unavailable or denied metrics.
                guard value.isFinite, value >= 0, value <= 200_000 else { return }
                records.append(DailySteps(
                    provider: "apple_health",
                    date: formatter.string(from: stats.startDate),
                    steps: Int(value.rounded()),
                    acquiredAt: acquired,
                    aggregationTimeZone: calendar.timeZone.identifier,
                    sourceTimestampVerified: false,
                    automaticSyncCertified: false
                ))
            }
            guard self.isCurrent(lease) else {
                completion(.failure(ReaderError.invalidated))
                return
            }
            completion(.success(records.sorted { $0.date < $1.date }))
        }
        healthStore.execute(query)
    }

    /// Call on logout, account replacement, background, or permission revocation.
    /// Query callbacks are not a transport: the native host must also fence
    /// any late completion against the current signed-in user and web page.
    func revokeLocalReadApproval() {
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
