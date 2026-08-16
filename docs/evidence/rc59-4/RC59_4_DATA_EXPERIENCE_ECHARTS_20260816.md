# RC59.4 — Data Experience / ECharts

Date: 2026-08-16
Status: CLOSED

## Scope

RC59.4 turns the RC59.3 longitudinal aggregation contract into a role-aware
visual data experience.

It does not recalculate longitudinal metrics and does not read sensors,
telemetry streams or provider APIs directly.

## Role density

Client:

- simple 28-day reading;
- current average;
- coverage;
- neutral change against the previous 28-day baseline;
- four priority metrics;
- adherence context;
- plain-language data trust.

Coach / Admin:

- 7 / 28 / 90-day comparison;
- current 28-day vs immediately previous 28-day baseline;
- 90-day trend and sample coverage;
- provenance;
- VFC method comparability;
- all canonical wearable metrics;
- professional method/data-trust panel.

## ECharts runtime

Pinned upstream:

Apache ECharts 6.1.0

Runtime bundle:

public/m26/vendor/echarts-6.1.0.esm.min.js

Upstream Git blob SHA-1:

b29a5c8de6871ef2599b4ca3c81f75b7bb45f555

The bundle is served same-origin by the PWA.
There is no runtime CDN request.

The implementation uses SVG for ordinary charts and initializes charts only
when they approach the viewport.

## Licensing

Vendored from the official Apache ECharts 6.1.0 tag:

- LICENSE
  c633765305b658c2b42837d2b72071d73c0379c5
- NOTICE
  c6a6e5e43b0d3cf6524297b9fa0c346f96b70602
- d3 license
  721bd22ece6587a9408eda1b6a3949c425b5624a

## Accessibility and fallback

Every chart has:

- ECharts ARIA enabled;
- semantic label;
- SVG renderer;
- reduced-motion handling;
- ResizeObserver support;
- safe dispose;
- visible failure state;
- expandable HTML table with date, aggregated value and quality.

The table remains the semantic fallback; data is not accessible only through
the chart.

## Data trust

The UI preserves RC59.3 semantics:

- 7 / 28 / 90 windows;
- 28 vs previous 28 baseline;
- least-squares 90-day trend;
- visible coverage;
- no missing-data imputation;
- daily equal-provider mean;
- same known VFC method required for comparison.

No language such as better/worse is derived from a physiological direction.

## Decision policy

- automatic prescription changes: false;
- clinical classification: false;
- Coach decision required: true.

Rule:

dato → contexto → entrenador decide.

## Architecture

Route view model computes RC59.3 aggregation once.

Route renderer passes only that aggregation to Data Experience.

Data Experience does not import wearable acquisition or telemetry modules.

## Backend / dependency safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- pinned vendored runtime dependency: Apache ECharts 6.1.0.

## Historical test stability

RC59 historical PWA tests are changed to assert their preserved lineage
markers rather than pinning the mutable current service-worker version.

The current RC59.4 VERSION/PREVIOUS_VERSION pair is enforced by the release
script and RC59.4 release gate.

## Roadmap

RC59.4 is closed.
RC59.5 Challenge Metrics Foundation is the next active software stage.

RC59.2 Health Connect physical E2E remains independently pending on a real
Android device with source data.
## Premium report parity release gate

RC59.4 also records the cross-cutting product requirement agreed for all formal
IBERFIT reports: the final artifact must meet the IRI Premium level of editorial
quality, traceability, audience adaptation and A4/PDF presentation.

This is stored in `docs/product/PREMIUM_REPORT_PARITY.md` and treated as a
release gate for future report families rather than as a claim that every
future renderer already exists.