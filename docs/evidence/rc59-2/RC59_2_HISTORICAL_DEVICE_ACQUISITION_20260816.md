# RC59.2 — Historical device acquisition / Health Connect

Date: 2026-08-16
Status: SOFTWARE_CLOSED
Resume lineage: V1 stopped before staging/commit/push; V2 continued from the guarded partial state.
Physical E2E: PENDING_ANDROID_DEVICE

## Scope

RC59.2 adds the software path for historical Android Health Connect data
without creating a parallel wearable model.

The existing IBERFIT wearable daily-summary contract remains canonical.
Health Connect feeds that contract through the existing normalization,
offline queue and remote wearable synchronization path.

## Capabilities

The user can select the categories to authorize:

- steps;
- sleep;
- resting heart rate;
- heart-rate variability (RMSSD);
- active energy;
- exercise duration.

Authorization is read-only and per capability.

The initial historical window is deliberately bounded to 30 days.
This stage does not request full-history access or background reading.

## Data minimization

The native reader returns daily normalized summaries only.
It does not persist routes, raw workouts, raw sleep stages or raw health
records inside the web application.

The original source remains Health Connect.

No automatic clinical interpretation or prescription change is introduced.

Rule:

data → context → coach decides.

## Governance

The acquisition plan records:

- explicit consent model;
- purpose per capability;
- provenance;
- timestamps;
- quality;
- authenticated-client ownership;
- read permission selection;
- existing wearable retention policy;
- existing export/delete route;
- auditability.

## Android implementation

The Android host uses the stable Health Connect client dependency:

androidx.health.connect:connect-client:1.1.0

The reader is compiled as part of the phone APK source set and is required to
pass the real Android APK build/signature gate before publication.

Manifest permissions are limited to:

- READ_STEPS
- READ_SLEEP
- READ_RESTING_HEART_RATE
- READ_HEART_RATE_VARIABILITY
- READ_ACTIVE_CALORIES_BURNED
- READ_EXERCISE

Not requested:

- READ_HEALTH_DATA_HISTORY
- READ_HEALTH_DATA_IN_BACKGROUND
- any health WRITE permission

## Safety / backend

- remote schema mutation: none;
- migration-history mutation: none;
- production health-data write by this implementation script: none;
- new npm runtime dependency: none;
- existing wearable RLS/export/delete path retained.

## Gates

Publication requires:

- generated PWA APP_SHELL check;
- Node syntax;
- all RC59 tests;
- real Android phone + Wear APK build;
- APK signature verification;
- complete npm regression;
- git diff checks;
- exact-path staging;
- fast-forward push.

## Remaining physical gate

A real Android device with Health Connect data is still required to validate
the permission dialog and source-data read end to end. That hardware/data gate
is tracked explicitly and does not block implementation of RC59.3.

## Roadmap

RC59.2 software is closed.
RC59.3 Longitudinal aggregation layer is the next active software stage.