import Foundation

@main
struct IBERFITAppleQAReadLeaseSpec {
    static func main() {
        precondition(IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: 42, nowUptime: 42))
        precondition(IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: 42, nowUptime: 162))
        precondition(!IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: 42, nowUptime: 162.0001))
        precondition(!IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: nil, nowUptime: 42))
        precondition(!IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: 42, nowUptime: 0))
        precondition(!IBERFITAppleQAReadLease.isCurrent(approvedAtUptime: .nan, nowUptime: 42))
        print("IBERFIT one-shot native QA approval expiry: PASS")
    }
}
