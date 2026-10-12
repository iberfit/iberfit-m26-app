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

## Connected360 Android Canary QA session fencing

The isolated DEBUG `cl.iberfit.m26.qa` WebView supports a bounded Health Connect preview, not production native sync. A distinct Android button enables one local read for 120 seconds, checked using monotonic elapsed time and consumed before the read begins. The authenticated web controller now sends an idempotent `health.invalidate` control when logging out, switching account or being disposed. The exact-origin, main-frame-only native handler immediately clears the local approval and retires the in-flight page fence; late OS responses never enter another account. No health payload, session token, client identifier, remote grant or server write is included in the control message.

These QA controls do not replace official Android Health Connect permissions or server-side consent. Automatic foreground synchronization, signed device testing and production release remain disabled until certification.
