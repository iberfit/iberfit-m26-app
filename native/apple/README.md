# IBERFIT Apple Native Package

Swift Package boundary for Xcode.

Targets:
- `IBERFITWatchTelemetry`: HealthKit / Apple Watch workout telemetry.
- `IBERFITWebBridge`: iOS WKWebView transport to the IBERFIT web experience.

Open `Package.swift` with Xcode on macOS. The package manifest is intentionally kept inside the repository so the native boundary can be versioned with the web application.

Required in the consuming app:
- HealthKit capability for the watch target.
- Health usage descriptions from `Info.plist.fragment`.
- `IBERFITHealthKit.entitlements` merged into the appropriate target.

Windows validation verifies package structure only; it does not claim an Xcode build.
