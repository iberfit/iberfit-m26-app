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
