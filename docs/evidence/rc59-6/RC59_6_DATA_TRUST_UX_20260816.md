# RC59.6 — Data Trust UX

Date: 2026-08-16
Status: CLOSED

## Scope

RC59.6 makes data trust visible in the product wherever objective device or
longitudinal data can influence interpretation.

The visible contract contains:

- provenance / source;
- observation date;
- quality;
- coverage;
- explicit missing-data state;
- method.

## Longitudinal Data Experience

Each visible metric card now carries its own trust strip. This applies to both
Client and Coach/Admin density.

VFC displays its actual known method (for example RMSSD) instead of hiding the
method behind a generic metric label.

Ordinary longitudinal metrics disclose that their daily value is based on the
canonical daily-provider-mean policy.

## Activity / wearable UX

The 7-day device summary displays source, latest date, quality, coverage,
missing-data state and aggregation method.

Each individual daily wearable record also exposes source, date, quality and
normalization / VFC method.

An empty device window remains explicit; zero coverage is not presented as a
physiological zero.

## Challenge trust

RC59.5 challenge evaluation now preserves:

- `asOf`;
- canonical source;
- quality;
- coverage;
- providers;
- method;
- missing/consent reason.

Device-derived challenges still require explicit opt-in and remain ineligible
for group leaderboards while consent is absent.

## Safety

The trust layer is presentation/context only.

It does not:

- diagnose;
- infer clinical meaning from a trend;
- change training prescription;
- set RPE/RIR;
- progress load automatically.

Rule:

dato → contexto → entrenador decide.

## Backend / dependencies

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains independently pending on a real
Android device.

## Roadmap

RC59.6 is closed.
RC60 Coach Productivity is the next active software stage.