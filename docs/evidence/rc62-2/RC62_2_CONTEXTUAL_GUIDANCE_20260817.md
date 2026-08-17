# RC62.2 — Contextual Guidance

Date: 2026-08-17
Status: CLOSED

## Objective

RC62.2 adds concise contextual help where IBERFIT already exposes technical
concepts that benefit from explanation.

The guidance layer is explanatory only. It does not change data, authorization,
clinical meaning or training prescription.

## Guided concepts

The canonical guidance catalog covers:

- IRI;
- VFC;
- data quality;
- data provenance;
- data coverage;
- data method;
- training load, RPE and RIR.

## IRI

IRI guidance explains the initial structured evaluation as a traceable
assessment used to support planning.

It explicitly states that the IRI does not replace clinical assessment and does
not generate automatic prescription.

## VFC

VFC guidance explains that longitudinal comparison requires one known,
homogeneous method.

RMSSD and SDNN are not treated as interchangeable measurements.

VFC remains contextual information and never changes training automatically.

## Data trust

The existing Data Trust strip now exposes contextual help for source, quality,
coverage and method.

The guidance preserves the RC59.6 contract:

- missing data is never fabricated as zero;
- quality is a technical trust descriptor, not a health classification;
- provenance remains visible;
- coverage and quality remain separate concepts;
- method is part of comparability.

## Training load

Session-builder RPE help explains RPE, RIR and load together.

The guidance explicitly preserves:

`dato → contexto → entrenador decide`

No guidance entry can increase or reduce load, series, repetitions, rest or
exercise selection.

## Interaction and accessibility

Each trigger is a real button with:

- a minimum IBERFIT touch target;
- `aria-haspopup="dialog"`;
- `aria-expanded`;
- an explicit accessible name.

The contextual panel:

- is a non-modal dialog;
- closes with Escape;
- returns focus to its trigger;
- closes on outside interaction;
- contains only catalog-controlled copy.

The panel does not become a blocking tour and does not replace a
self-explanatory interface.

## Architecture

`src/m26/guidance/contextual-guidance.js` owns:

- the fixed guidance catalog;
- trigger rendering;
- popover rendering;
- one application-owned controller.

The authenticated application mounts and destroys the controller with the
existing product lifecycle.

No global auto-bootstrap side effect is introduced.

## Resume compatibility note

RC62.2 V1 stopped before writing `session-ui.js` because a PowerShell
double-quoted patch anchor around JavaScript template-literal syntax did not
match the source.

All preceding RC62.2 changes were verified exactly against the V1 patch plan.
Resume V2 preserves those files and applies the session-builder guidance patch
with literal single-quoted here-strings so PowerShell cannot interpolate
JavaScript `${...}` expressions.

## Target-regression compatibility

The first complete RC59–RC62 target run reached 230 tests with 226 passing and
four failures.

Three failures were historical PWA-lineage checks. RC62.2 had accidentally
omitted the durable `m26-rc59-0a` marker while prepending the new RC62.2
version. The marker is restored; no cache behavior or current version is
rolled back.

The fourth failure was a wording mismatch in the new IRI guidance test. Product
copy intentionally reads “no sustituye … ni genera …”; the test now asserts
that exact wording instead of “no genera”.

No RC62.2 business behavior was changed by these compatibility corrections.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- backend command surface: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC62.3 — Progressive Onboarding.