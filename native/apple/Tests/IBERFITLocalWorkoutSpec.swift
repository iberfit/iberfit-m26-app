import Foundation
@main
struct IBERFITLocalWorkoutSpec {
    static func main() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let from = now.addingTimeInterval(-30*86_400)
        let id = UUID()
        func row(_ id: UUID = UUID(), start: Double = -3600, end: Double = -1800,
                 active: Double = 1500, distance: Double? = 5000, heartRate: Double? = nil, sport: String = "running") -> IBERFITLocalWorkout? {
            IBERFITLocalWorkout(id: id, sport: sport, start: now.addingTimeInterval(start),
                end: now.addingTimeInterval(end), activeSeconds: active,
                distanceMeters: distance, averageHeartRate: heartRate, from: from, until: now)
        }
        let a = row(id)!
        precondition(a.activeSeconds == 1500 && a.distanceMeters == 5000)
        precondition(a.averageHeartRate == nil)
        precondition(row(heartRate: 148.5)?.averageHeartRate == 148.5)
        precondition(row(heartRate: 0)?.averageHeartRate == nil)
        precondition(row(heartRate: 241)?.averageHeartRate == nil)
        precondition(row(heartRate: .nan)?.averageHeartRate == nil)
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
        #if canImport(CryptoKit)
        let fixtureID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
        let first = row(fixtureID, distance: nil, heartRate: 148, sport: "swimming")!
        let projected = IBERFITAppleWorkoutImportRow(workout: first)!
        precondition(projected.observationKey == "3bc39891501187450d804a033f044fc03ba2f293b659a487173aa525bdc309ad")
        let replay = IBERFITAppleWorkoutImportRow(workout: row(fixtureID, distance: 1500, sport: "swimming")!)!
        precondition(projected.observationKey == replay.observationKey)
        let secondID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
        let other = IBERFITAppleWorkoutImportRow(workout: row(secondID)!)!
        precondition(other.observationKey == "4416e103f9613bee48714d0d0f0bf6a3755d8e0a0f2fa3a249de4a297d236f19")
        precondition(projected.observationKey != other.observationKey)
        let data = try! JSONEncoder().encode(projected)
        let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        precondition(Set(json.keys) == Set(["observationKey","sport","startedAt","endedAt","activeSeconds","distanceMeters"]))
        precondition(json["distanceMeters"] is NSNull)
        precondition(json["sport"] as? String == "swimming")
        precondition(json["activeSeconds"] as? Double == 1500)
        precondition(projected.startedAt.hasSuffix(".000Z") && projected.endedAt.hasSuffix(".000Z"))
        let zeroData = try! JSONEncoder().encode(IBERFITAppleWorkoutImportRow(workout: row(distance: 0)!)!)
        let zero = try! JSONSerialization.jsonObject(with: zeroData) as! [String: Any]
        precondition(zero["distanceMeters"] as? Double == 0)
        precondition(IBERFITAppleWorkoutImportRow(workout: row(start: -0.0002, end: -0.0001, active: 0.0001)!) == nil)
        let text = String(decoding: data, as: UTF8.self)
        precondition(!text.contains(fixtureID.uuidString) && !text.contains("averageHeartRate"))
        let pagedRows = (0..<41).map { i in row(start: -7200-Double(i)*60, end: -3600-Double(i)*60)! }
        var pager = IBERFITAppleWorkoutCandidatePager(workouts: pagedRows, returnedCount: 41, days: 30, acquiredAt: now, uptime: 100)!
        let p0 = pager.page(days: 30, cursor: nil, uptime: 100)!
        precondition(p0.records.count == 20 && p0.cursor == nil && p0.nextCursor != nil)
        let p1 = pager.page(days: 30, cursor: p0.nextCursor, uptime: 101)!
        let replayPage = pager.page(days: 30, cursor: p0.nextCursor, uptime: 102)!
        precondition(p1.records.map(\.observationKey) == replayPage.records.map(\.observationKey))
        precondition(p1.nextCursor == replayPage.nextCursor && p1.acquiredAt == p0.acquiredAt)
        let p2 = pager.page(days: 30, cursor: p1.nextCursor, uptime: 103)!
        precondition(p2.records.count == 1 && p2.nextCursor == nil)
        precondition(Set((p0.records+p1.records+p2.records).map(\.observationKey)).count == 41)
        let pageJSON = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(p0)) as! [String: Any]
        precondition(Set(pageJSON.keys) == Set(["schema","provider","days","cursor","nextCursor","acquiredAt","records","readPermissionStatus","persisted"]))
        precondition(pageJSON["cursor"] is NSNull && pageJSON["readPermissionStatus"] as? String == "not_disclosed")
        precondition(pageJSON["persisted"] as? Bool == false)
        precondition(pager.page(days: 7, cursor: p0.nextCursor, uptime: 104) == nil)
        precondition(pager.page(days: 30, cursor: UUID(), uptime: 104) == nil)
        precondition(pager.page(days: 30, cursor: nil, uptime: 221) == nil)
        precondition(pager.page(days: 30, cursor: nil, uptime: 100) == nil)
        precondition(IBERFITAppleWorkoutCandidatePager(workouts: pagedRows, returnedCount: 42, days: 30, acquiredAt: now) == nil)
        precondition(IBERFITAppleWorkoutCandidatePager(workouts: [a,a], returnedCount: 2, days: 30, acquiredAt: now) == nil)
        precondition(IBERFITAppleWorkoutCandidatePager(workouts: [row(start: -8*86_400,end: -8*86_400+3600)!], returnedCount: 1, days: 7, acquiredAt: now) == nil)
        var emptyPager = IBERFITAppleWorkoutCandidatePager(workouts: [], returnedCount: 0, days: 7, acquiredAt: now, uptime: 1)!
        let empty = emptyPager.page(days: 7, cursor: nil, uptime: 1)!
        precondition(empty.records.isEmpty && empty.nextCursor == nil)
        emptyPager.invalidate()
        precondition(emptyPager.page(days: 7, cursor: nil, uptime: 1) == nil)
        print("IBERFIT_APPLE_V54_CANDIDATE_PAGING_OK")
        print("IBERFIT_APPLE_V54_CANDIDATE_PROJECTION_OK")
        #endif
        print("IBERFIT_LOCAL_WORKOUT_PREVIEW_OK")
    }
}
