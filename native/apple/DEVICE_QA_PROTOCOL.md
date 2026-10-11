# IBERFIT Connected 360 — iPhone + Apple Watch physical QA

**Status:** not executed. This is a release-blocking test protocol, not proof of a completed physical test.

## Build identity and Apple prerequisites

- Use the exact merged Canary SHA when conducting the hardware QA; a pull-request build is not that SHA.
- The isolated test app has bundle ID `cl.iberfit.m26.connected360qa` and must remain a **Debug-only** build. It is not the IBERFIT production app.
- Apple Developer signing team and provisioning profile must explicitly include **HealthKit**. An unsigned `iphoneos` compilation cannot be installed or used to prove permissions.
- Xcode must include `NSHealthShareUsageDescription` in the built app and the `com.apple.developer.healthkit` entitlement in its signed permissions.
- Keep all HealthKit writes and background delivery disabled. This app only reads local steps, resting heart rate and sleep.
- The CI artifact `iberfit-connected360-iphoneos-unsigned-<run_id>` contains **only JSON metadata**, not a signed IPA or sensitive health information.

## Hardware scenario matrix

| Scenario | Expected proof / release condition |
| --- | --- |
| iPhone alone, Apple Salud with records | With visible user action and HealthKit dialog, read at most seven civil dates locally, never send data to IBERFIT servers |
| Paired Apple Watch, mixed samples | Avoid double-counting overlapping sleep samples; do not assert which watch produced a summary without evidence |
| No records, selective/denied OS permissions | Distinguish no data from read errors; HealthKit does not disclose each read grant, so never display `permission granted` as a fact |
| Time-zone change and daylight-saving night | Group by actual civil dates; sleep union across midnight remains correct without treating 23/25-hour days as 24-hour invariants |
| Sleep query error with steps available | Show partial success and each failed metric independently without inventing missing values |
| Native approval untouched for more than 120 seconds | Reject the subsequent web request, require an explicit new local tap |
| Repeat a consumed native read request | Reject replay: one approval permits exactly one local read |
| Navigation outside HTTPS Canary / subframe message | Fail closed, do not leak data or tokens to untrusted origins |
| Client A logs out during an OS read, then Client B logs in | Revoke one-shot approval, suppress late responses, never surface data from A to B |
| App enters background during permission/read | Invalidate generation and sensitive local preview; on resume do not silently reconnect or request permissions |
| Network off, app suspended and reconnected | No retry storm or unauthorized network writes; honest recoverable UI |
| Screen reader, 320px phone, large Dynamic Type | Reachable authorization actions, clear focus/labels, no clipped or hidden critical controls |
| Physical Android peer test | Separate signed/device Health Connect consent review; iPhone results never imply Android readiness |

## Minimal QA evidence without health data

Record only: Canary source SHA, DEBUG app identifier, Xcode/iOS version,
physical device type, Apple Watch pairing present/absent, anonymized scenario ID,
pass/fail outcome and non-sensitive error code. Never capture usernames,
client IDs, tokens, screenshots of health samples or raw measurements in GitHub.
Signing certificate/private key and provisioning profile must not be added to
source control, artifacts or issue attachments.

## Release decision

This isolated DEBUG test does **not** authorize production syncing. The real
release requires separate evidence for native one-click onboarding, affirmative
IBERFIT server data consent, revoked/paused states, offline idempotence,
owner-scoped writes with server authorization, provenance of overlapping sources,
responsive/mobile accessibility and device-specific smoke tests.

Do not enable the Apple V45 server writer or `productionAllowed` solely because
the unsigned arm64 preflight passes. Do not ask a production Client to exercise
these features until the signed QA tests and rollout gate are satisfied.
