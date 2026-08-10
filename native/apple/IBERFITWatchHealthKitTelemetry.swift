import Foundation
import HealthKit

/// watchOS reference implementation for IBERFIT live heart-rate telemetry.
/// Requires an Xcode watchOS target with HealthKit enabled.
final class IBERFITWatchHealthKitTelemetry: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    struct Sample: Codable {
        let type: String
        let provider: String
        let heartRateBpm: Double
        let quality: String
        let recordedAt: String
    }

    private let healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    var onSample: ((Sample) -> Void)?

    func requestAuthorization(completion: @escaping (Result<Void, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(NSError(domain: "IBERFIT", code: 1)))
            return
        }
        guard let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            completion(.failure(NSError(domain: "IBERFIT", code: 2)))
            return
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        let read: Set<HKObjectType> = [heartRate]
        healthStore.requestAuthorization(toShare: share, read: read) { success, error in
            if let error { completion(.failure(error)); return }
            success
                ? completion(.success(()))
                : completion(.failure(NSError(domain: "IBERFIT", code: 3)))
        }
    }

    func start() throws {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .functionalStrengthTraining
        configuration.locationType = .indoor

        let session = try HKWorkoutSession(
            healthStore: healthStore,
            configuration: configuration
        )
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: configuration
        )
        session.delegate = self
        builder.delegate = self
        workoutSession = session
        workoutBuilder = builder

        let startDate = Date()
        session.startActivity(with: startDate)
        builder.beginCollection(withStart: startDate) { _, _ in }
    }

    func pause() { workoutSession?.pause() }
    func resume() { workoutSession?.resume() }

    func stop() {
        let endDate = Date()
        workoutSession?.end()
        workoutBuilder?.endCollection(withEnd: endDate) { [weak self] _, _ in
            self?.workoutBuilder?.finishWorkout { _, _ in }
        }
    }

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        guard
            let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
            collectedTypes.contains(heartRateType),
            let statistics = workoutBuilder.statistics(for: heartRateType),
            let quantity = statistics.mostRecentQuantity()
        else { return }

        let unit = HKUnit.count().unitDivided(by: HKUnit.minute())
        let bpm = quantity.doubleValue(for: unit)
        guard bpm >= 25, bpm <= 240 else { return }

        onSample?(Sample(
            type: "sample",
            provider: "apple_health",
            heartRateBpm: bpm,
            quality: "alta",
            recordedAt: ISO8601DateFormatter().string(from: Date())
        ))
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {}
}
