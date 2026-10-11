import Foundation

@main
struct IBERFITHealthKitDailySleepUnionSpec {
    static func main() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Santiago")!
        let iso = ISO8601DateFormatter()
        func date(_ s: String) -> Date { iso.date(from: s)! }
        let lower = date("2026-10-10T00:00:00Z")
        let upper = date("2026-10-13T00:00:00Z")
        let night = IBERFITHealthKitSleepInterval(
            start: date("2026-10-11T00:00:00Z"),
            end: date("2026-10-11T06:00:00Z")
        )
        let duplicates = IBERFITHealthKitDailySleepUnion.minutes(
            intervals: [night, night], from: lower, until: upper, calendar: cal
        )
        precondition(duplicates["2026-10-10"] == 180)
        precondition(duplicates["2026-10-11"] == 180)
        let overlap = IBERFITHealthKitDailySleepUnion.minutes(
            intervals: [night, .init(start: date("2026-10-11T05:00:00Z"),
                                      end: date("2026-10-11T07:00:00Z"))],
            from: lower, until: upper, calendar: cal
        )
        precondition(overlap["2026-10-11"] == 240)
        precondition(IBERFITHealthKitDailySleepUnion.minutes(
            intervals: [], from: lower, until: upper, calendar: cal
        ).isEmpty)
        let day = cal.date(from: DateComponents(year: 2026, month: 9, day: 6))!
        let next = cal.date(byAdding: .day, value: 1, to: day)!
        let dst = IBERFITHealthKitDailySleepUnion.minutes(
            intervals: [.init(start: day, end: next)],
            from: day, until: next, calendar: cal
        )
        precondition(dst["2026-09-06"] == Int(next.timeIntervalSince(day) / 60))
        print("IBERFIT local HealthKit sleep union: PASS")
    }
}
