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

## Connected 360 · iOS HealthKit daily local reader (QA source only)

`IBERFITIOSHealthKitDailyReader.swift` is compiled as part of the iOS
`IBERFITWebBridge` Swift package target. It is not installed in a signed IBERFIT
iOS app by this package alone.

- Explicit iOS HealthKit read authorization requested only on a user action;
  `toShare` is empty. A successful authorization callback **does not prove**
  that a particular read permission was granted.
- One-shot local read capped to the current seven Gregorian civil days, using
  the phone's actual aggregation time zone. Only existing daily step sums are
  returned, with acquisition time separate from unknown sensor timestamps.
- No HealthKit values, tokens or watch serials are posted to WebKit or Supabase
  by this class. It cannot activate background / automatic synchronization.
- `sourceTimestampVerified=false`, `automaticSyncCertified=false`, and
  `productionAllowed=false` remain invariant.
- The UI host must cancel or discard a late asynchronous query after
  logout, session change, background/navigation, or withdrawal of consent.
- Before release: Xcode iOS compile, signed iPhone HealthKit entitlement and
  usage descriptions, physical permission granted/denied, Watch + phone
  overlap/source provenance, time zone/DST, absent/zero data, retry, two-account
  swap and revoked data, all validated end to end. Sleep and resting heart-rate
  historical readings are **not provided** by this new reader yet.

Apple API reference: HealthKit `HKStatisticsCollectionQuery` and
`HKHealthStore.requestAuthorization(toShare:read:completion:)`.

## Local QA expansion: steps + resting heart rate

The isolated SwiftUI iPhone QA app now uses
`IBERFITIOSHealthKitDailyVitalsReader.swift`, a *separate*, minimal daily reader.
One explicit HealthKit permission sheet requests **read-only** access to
`stepCount` and `restingHeartRate`. One user-triggered query retrieves at most
seven local civil dates. Steps use daily cumulative sums; resting heart rate
uses the daily *discrete average* of HealthKit resting-heart-rate samples, not
exercise heart rate. The screen marks missing/denied data as **Sin dato**;
an authorization-completion success is not proof of an individual permission.

The original steps-only reader remains for existing regression contracts. Both
readers have generation fences on account replacement/foreground leave. No
source watch identity or source-modified timestamp is verified or fabricated.
No data is persisted or uploaded, and sleep remains **unimplemented in the
iPhone QA reader**. In particular, summing sleep stages from several sources
without interval/source deduplication could double-count, so that feature
requires a separate validated daily attribution algorithm.

The new QA app and both readers remain disabled for normal production release:
`productionAllowed=false`, `automaticSyncCertified=false`. Simulator
compilation does not replace signing, entitlements or physical permission tests.

## HealthKit local QA — sleep analysis

A single user-initiated read-only permission request covers steps, resting heart rate and `sleepAnalysis`. Only `HKCategoryValueSleepAnalysis.allAsleepValues` are counted: `inBed` and `awake` are excluded. Staged sleep segments from overlapping sources are unioned rather than summed, then divided at local calendar midnight (including DST); absent data are not fabricated as zero. If sleep fails, independently acquired steps and resting heart rate remain available with an explicit partial-read notice. A saturated 1,500-sample query fails closed instead of silently truncating. These results are QA-only, not watch identity verification, clinically validated sleep staging, remote account synchronization or background access. Real-device source reconciliation remains required before any production writes.
