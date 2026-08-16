# RC59.3 — Longitudinal aggregation layer

Date: 2026-08-16
Status: CLOSED

## Scope

RC59.3 builds a pure longitudinal aggregation layer on top of the canonical
IBERFIT daily wearable summaries and the existing progress engine.

It does not add a visualization library. RC59.4 consumes this layer.

## Windows

The aggregation exposes fixed views for:

- 7 days;
- 28 days;
- 90 days.

Every wearable metric carries explicit coverage and missing days are never
imputed.

## Baseline and change

Baseline method:

current 28 days vs the immediately previous 28 days.

For comparable metrics the layer exposes:

- current mean;
- baseline mean;
- absolute change;
- percentage change when the baseline is non-zero;
- coverage for both periods.

## Trend

Trend method:

ordinary least-squares slope over daily values inside the 90-day window.

A minimum of 7 days with data is required.

The output is mathematical context only. Increasing/decreasing does not mean
better/worse and has no clinical interpretation.

## Multi-provider policy

Records remain deduplicated by client + provider + date using the existing
canonical wearable policy.

When more than one provider contributes the same metric on the same day, the
longitudinal layer first computes an equal daily provider mean so that adding
a second provider does not give that date extra longitudinal weight.

## VFC comparability

VFC is only compared or trended when one known method is consistent across
the relevant data.

RMSSD and SDNN are never silently combined into a longitudinal change.

## Adherence

Adherence uses the existing progress engine and is exposed for 7/28/90 days,
plus the immediately previous 28-day baseline and the absolute adherence
change.

## Data trust

The contract records:

- source collection;
- deduplication policy;
- multi-provider daily policy;
- baseline method;
- trend method;
- VFC comparability rule;
- missing-data policy;
- coverage.

## Decision policy

- automatic prescription changes: false;
- clinical classification: false;
- Coach decision required: true.

Rule:

dato → contexto → entrenador decide.

## Backend / dependencies

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- new npm runtime dependency: none;
- new Android dependency: none.

## Validation gates

Publication requires:

- Node syntax checks;
- generated PWA APP_SHELL verification;
- all RC59 tests;
- complete npm regression;
- git diff checks;
- exact-path staging;
- fast-forward push.

## Roadmap

RC59.3 is closed.
RC59.4 Data Experience / ECharts is the next active software stage.

The RC59.2 physical Health Connect E2E remains independently tracked as
pending Android-device validation.