import Foundation
@main
struct IBERFITLocalWorkoutSpec {
    static func main() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let from = now.addingTimeInterval(-30*86_400)
        let id = UUID()
        func row(_ id: UUID = UUID(), start: Double = -3600, end: Double = -1800,
                 active: Double = 1500, distance: Double? = 5000, sport: String = "running") -> IBERFITLocalWorkout? {
            IBERFITLocalWorkout(id: id, sport: sport, start: now.addingTimeInterval(start),
                end: now.addingTimeInterval(end), activeSeconds: active,
                distanceMeters: distance, from: from, until: now)
        }
        let a = row(id)!
        precondition(a.activeSeconds == 1500 && a.distanceMeters == 5000)
        precondition(row(distance: nil)?.distanceMeters == nil)
        precondition(row(distance: 0)?.distanceMeters == 0)
        precondition(row(distance: .infinity)?.distanceMeters == nil)
        precondition(row(distance: -1)?.distanceMeters == nil)
        precondition(row(active: .nan) == nil)
        precondition(row(active: 1802) == nil)
        precondition(row(end: 1) == nil)
        precondition(row(start: -31*86_400) == nil)
        precondition(row(sport: "unknown") == nil)
        let b = row(start: -2000, end: -200, sport: "swimming")!
        let preview = IBERFITLocalWorkoutPreview(workouts: [a,a,b], returnedCount: 3)
        precondition(preview.workouts.map(\.id) == [b.id,a.id] && !preview.mayHaveMore)
        let full = IBERFITLocalWorkoutPreview(workouts: (0..<61).map {_ in row()!}, returnedCount: 61)
        precondition(full.workouts.count == 60 && full.mayHaveMore)
        print("IBERFIT_LOCAL_WORKOUT_PREVIEW_OK")
    }
}
