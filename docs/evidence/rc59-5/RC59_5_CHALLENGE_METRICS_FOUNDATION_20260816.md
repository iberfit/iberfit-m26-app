# RC59.5 — Challenge Metrics Foundation

Date: 2026-08-16
Status: CLOSED

## Scope

RC59.5 establishes the canonical metric foundation for IBERFIT challenges.

Challenges do not read sensors, live telemetry bridges or raw health streams.
They consume the already-normalized IBERFIT layers:

- longitudinal aggregation;
- progress engine;
- confirmed engagement habit logs.

## Initial challenge types

- consistency;
- sessions;
- steps;
- activity;
- habits;
- personal progress;
- Coach-defined individual goals.

## Safety

Competitive metrics are allow-listed.

The foundation explicitly rejects heart-rate, resting-heart-rate, HRV, BPM,
pulse and raw metric targets. "Higher heart rate" can therefore never become a
competitive objective through this contract.

There is no automatic training prescription and no clinical classification.

## Device consent

Steps, active minutes and workout minutes are device-derived challenge metrics.
They require explicit device opt-in before evaluation.

If opt-in is absent, the result is `consent_required`; the value is not exposed
and the participant is not leaderboard-eligible.

## Privacy-safe group projection

Group leaderboards expose only:

- rank;
- participant identifier / display alias;
- percentage progress;
- completion state.

They do not publish raw health values, raw telemetry, HRV or heart-rate data.

Personal-progress and Coach-goal challenge types are individual-only in this
foundation and cannot be silently promoted into a group leaderboard.

## Provenance and quality

Every evaluated result declares:

- canonical source;
- quality context;
- coverage when available;
- provider provenance when available;
- device opt-in state when relevant;
- leaderboard eligibility.

No arbitrary physiological interpretation is added.

## Backend / dependency safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none.

## Product rails preserved

Premium Report Parity remains a required cross-cutting release gate at IRI
Premium level.

RC59.2 Health Connect physical E2E remains independently pending on a real
Android device with source data.

## Roadmap

RC59.5 is closed.
RC59.6 Data Trust UX is the next active software stage.