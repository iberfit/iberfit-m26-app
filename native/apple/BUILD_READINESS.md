# IBERFIT Apple native compile readiness

The Apple runtime in this repository must be compiled and exercised on macOS with Xcode.

Windows validation may verify Swift source structure, package boundaries, permissions, and bridge contracts, but it must not report an Xcode/watchOS build as completed.

Before hardware validation:
- open the Apple package/targets in Xcode on macOS;
- enable the required HealthKit capability and usage descriptions in the consuming app;
- build the iOS and watchOS targets;
- run the companion iPhone + Apple Watch pair;
- confirm live heart-rate telemetry reaches the active IBERFIT session;
- confirm loss of reachability does not replay stale live samples later.

Hardware testing remains a separate release gate from source/static validation.

## Automated simulator compilation (QA only)

The GitHub Actions workflow `.github/workflows/connected360-apple-native-qa.yml` runs on a macOS Xcode runner for changes to the native Apple package. It compiles both `IBERFITWebBridge` on iOS Simulator and `IBERFITWatchTelemetry` on watchOS Simulator with code signing disabled. It also checks the declared HealthKit usage text and entitlement, rejects privileged key patterns in Swift sources without printing matching lines, and runs the WebView HTTPS/main-frame origin regression test.

Compilation in an Apple simulator is a prerequisite, not proof of entitlement configuration in a signed app, physical iPhone/Watch pairing, granted HealthKit permissions, trusted historical sensor provenance, correct behaviour after logout or reconnection, background synchronization, or a production-ready automatic connection. Those require a separate physical-device E2E release gate.
