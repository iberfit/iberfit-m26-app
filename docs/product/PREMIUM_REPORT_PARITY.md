# IBERFIT — Premium Report Parity

Status: REQUIRED_RELEASE_GATE
Reference standard: IRI Premium

## Principle

Every formal report delivered by IBERFIT to a Client, Coach or Admin must meet
an editorial, methodological and export-quality standard equivalent to the IRI
Premium report, adapted to the purpose and audience of that document.

A dashboard capture, raw table dump or browser printout does not qualify as an
IBERFIT report.

## Required report family

The product roadmap must support Premium IBERFIT outputs for, at minimum:

- initial IRI report;
- IRI reassessment / comparative report;
- periodic progress report;
- cycle closeout report;
- longitudinal 7 / 28 / 90-day report;
- adherence and habits report;
- activity / device-data report;
- technical Coach/Admin report;
- simplified Client counterpart when the audience differs.

Not every report needs the same page count or density. Every formal output must
share the same level of finish, traceability and controlled interpretation.

## Minimum document contract

Every applicable report must include:

- IBERFIT visual identity and premium cover/header system;
- Client identity and reporting period;
- purpose and scope;
- provenance, date, quality and coverage of relevant data;
- results and comparisons appropriate to the report;
- charts/tables with semantic fallback where applicable;
- contextual interpretation without automatic clinical diagnosis;
- conclusions;
- recommendations / next actions when professionally appropriate;
- methodology and comparability rules where applicable;
- professional review / approval state;
- report date and version;
- A4/PDF-grade output with print-safe layout;
- accessible on-screen representation before export.

## Audience density

Client:

- understandable language;
- selected metrics;
- explanation of what was observed, why it matters, result and decision/context;
- no unnecessary technical overload.

Coach/Admin:

- full traceability;
- methodology;
- provenance and coverage;
- comparability limitations;
- richer tables and longitudinal detail;
- professional review context.

## Baseline already present

The existing IRI Premium report is the visual/documentary reference.
The generic report workflow already declares `format:'a4-premium'`, but that
flag alone is not sufficient: the rendered artifact must meet this parity gate.

## Decision policy

Reports may support professional reasoning but never silently turn a trend or
wearable value into a clinical diagnosis or an automatic training prescription.

Rule:

dato → contexto → entrenador decide.

## Release rule

No future IBERFIT formal report is considered complete merely because its data
contract exists. It closes only when the final Client/Coach artifact passes the
Premium Report Parity gate at IRI level.