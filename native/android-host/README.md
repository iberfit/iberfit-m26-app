# IBERFIT Android Native Host

Build harness for the native device bridge.

Requirements:
- JDK 17+
- Android SDK with API 36 installed
- Gradle 9.5.0 (or run `build.ps1 -AllowDownload`)

The module compiles the canonical Kotlin sources from:
- `native/android/wear`
- `native/android/ble`

Pinned platform versions:
- Android Gradle Plugin: 9.3.1
- Gradle: 9.5.0
- Health Services: 1.1.0-rc02

This harness does not publish an APK and does not connect to production.
