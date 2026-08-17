# RC62.3 — Progressive Onboarding

Date: 2026-08-17
Status: CLOSED

## Objective

RC62.3 completes the RC62 Agenda, Guidance & Onboarding rail with a progressive,
non-blocking onboarding layer for Client, Coach and Admin.

The onboarding does not replace the application's normal navigation or
self-explanatory surfaces. It only helps a user discover existing functions at
their own pace.

## Release decision

Driver.js is not added in RC62.3.

The current requirement is a compact progressive checklist, not a guided
spotlight tour. Native DOM, the existing canonical route events and the RC58
component system are sufficient with less runtime and supply-chain surface.

Driver.js remains an option for a future short, evidence-backed tour if a real
interaction cannot be taught progressively inside the product.

## Role tracks

### Coach

- Hoy;
- Clientes;
- Agenda;
- Biblioteca;
- Verificación.

The initial Coach track intentionally stays on global areas so it never requires
an implicit client selection or widens assignment scope.

### Client

- Hoy;
- Planificación;
- Sesiones;
- Progreso;
- Actividad.

### Admin

- Centro de control;
- Usuarios;
- Equipo;
- Operaciones;
- Auditoría.

Each step links through the existing `data-m26-area` navigation contract. The
onboarding controller does not create a second router or bypass route guards.

## Progressive behavior

A step is marked as visited only after its canonical area becomes active.

The guide:

- appears on the role home;
- can be hidden at any time;
- can be reopened from the top bar;
- shows deterministic completion progress;
- can be reset after completion.

It is never modal and never blocks the application.

## Local persistence

Progress is scoped by a one-way local hash of user id plus role.

Stored fields are limited to:

- schema version;
- role;
- visited step ids;
- hidden state;
- completion boolean.

No name, email, health data, IRI result, wearable value, training load or
appointment payload is stored by the onboarding layer.

If browser storage is unavailable, the controller fails safely to an in-memory
repository for the current page lifetime.

## Architecture

`src/m26/onboarding/progressive-onboarding.js` owns:

- role tracks;
- persistence normalization;
- progress derivation;
- panel rendering;
- one application-owned controller.

The authenticated application owns mount/destroy lifecycle. MutationObserver is
used only to reattach the local guide after the canonical shell re-renders.

## Accessibility

- launcher and step actions are real buttons;
- touch-target minimum is preserved;
- progress uses the native `<progress>` element plus visible text;
- the guide is non-modal;
- focus styling remains visible;
- mobile layout stacks the checklist;
- print hides onboarding controls.

## Target-regression compatibility

The first RC59–RC62 target run reached 244 tests with 243 passing and one
failure.

The only failure was the historical RC61.2 closeout test still asserting the
transient state `RC62=IN_PROGRESS_AGENDA_GUIDANCE_ONBOARDING`. RC62.3 correctly
closes RC62, so that historical test is stabilized to durable RC61.2 facts and
the cross-cutting Premium Report Parity / Health Connect rails.

No RC62.3 production behavior was changed by this compatibility correction.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- Driver.js added: no;
- backend command surface: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC63 — Exercise & Media Experience.