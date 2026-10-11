import Foundation

/// Local-only arithmetic: the caller supplies verified asleep-stage samples.
public struct IBERFITHealthKitSleepInterval: Sendable {
    public let start: Date
    public let end: Date
    public init(start: Date, end: Date) { self.start = start; self.end = end }
}

public enum IBERFITHealthKitDailySleepUnion {
    /// Combines overlapping intervals and splits at local midnight (DST-safe).
    /// Absent source data is absent in the result, never an invented zero.
    public static func minutes(
        intervals: [IBERFITHealthKitSleepInterval],
        from: Date, until: Date, calendar: Calendar
    ) -> [String: Int] {
        guard from < until else { return [:] }
        var days: [Date: [IBERFITHealthKitSleepInterval]] = [:]
        for interval in intervals {
            let start = max(from, interval.start)
            let end = min(until, interval.end)
            guard start < end else { continue }
            var cursor = start
            while cursor < end {
                let day = calendar.startOfDay(for: cursor)
                guard let next = calendar.date(byAdding: .day, value: 1, to: day),
                      next > cursor else { break }
                let stop = min(next, end)
                days[day, default: []].append(.init(start: cursor, end: stop))
                cursor = stop
            }
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        var totals: [String: Int] = [:]
        for (day, segments) in days {
            let ordered = segments.sorted { $0.start == $1.start
                ? $0.end < $1.end : $0.start < $1.start }
            var unionStart: Date?
            var unionEnd: Date?
            var seconds: TimeInterval = 0
            for item in ordered {
                if let start = unionStart, let end = unionEnd {
                    if item.start > end {
                        seconds += end.timeIntervalSince(start)
                        unionStart = item.start
                        unionEnd = item.end
                    } else {
                        unionEnd = max(end, item.end)
                    }
                } else {
                    unionStart = item.start
                    unionEnd = item.end
                }
            }
            if let start = unionStart, let end = unionEnd {
                seconds += end.timeIntervalSince(start)
            }
            let minutes = Int((seconds / 60).rounded())
            if minutes > 0 { totals[formatter.string(from: day)] = minutes }
        }
        return totals
    }
}
