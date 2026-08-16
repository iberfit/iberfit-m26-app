# RC59.1 — Live Session Intelligence

Date: 2026-08-16
Status: CLOSED after automated publication gates.

## Scope

RC59.1 converts the canonical live heart-rate timeline into visible,
explainable session intelligence without adding a new sensor source or a
clinical decision engine.

Implemented:

- current, mean, minimum and maximum heart rate;
- bounded live heart-rate timeline;
- source, quality and interpretable/raw coverage;
- response aggregated by block/exercise;
- observed heart-rate change during rest;
- heart-rate correlation with recorded RPE/RIR by exercise and set;
- explicit methodology;
- explicit coach-decision policy;
- responsive and forced-colors-aware presentation.

## Semantics

Canonical raw telemetry remains preserved.

Events marked acquiring, poor_contact, stale, out_of_range, disconnected or
unsupported remain in the raw timeline but are excluded from derived metrics.

Recovery is informational: first interpretable rest sample minus the latest
interpretable sample within the first 60 seconds of that rest.
No clinical classification is produced.

RPE/RIR correlation joins by exerciseId + setNumber and never modifies the
prescription.

Rule:

dato → contexto → entrenador decide.

## Safety

- automatic prescription changes: false;
- clinical classification: false;
- schema mutation: none;
- migration-history mutation: none;
- third-party runtime dependency added: none;
- production telemetry write by this implementation script: none.

## Publication gates

The implementation is publishable only after:

- Node syntax checks;
- all RC59 tests;
- complete npm test regression;
- regenerated and verified PWA APP_SHELL;
- git diff checks;
- exact-path staging;
- fast-forward push.

## Roadmap

RC59.1 is closed.
RC59.2 Historical device acquisition is the next active implementation stage.