# RC61.1 — Motion Foundation & Reduced Motion

Date: 2026-08-17
Status: CLOSED

## Scope

RC61.1 introduces one motion grammar for the existing IBERFIT application
without changing business rules, authorization, training prescription or
clinical interpretation.

This increment covers:

- save feedback;
- set-completion feedback;
- exercise/block insert and reorder feedback;
- client/session filter transitions;
- success/error action-state transitions;
- synchronization banner transitions;
- empty/loading entrance hooks;
- mandatory reduced-motion behavior.

RC61 remains IN_PROGRESS. RC61.2 will finish synchronization/empty-state
orchestration and close the motion rail after complete regression.

## Engine decision

The current RC61.1 interactions are simple enough for same-origin native WAAPI
plus CSS reduced-motion safeguards.

Motion (JavaScript library) is therefore not added in RC61.1. The roadmap rule
is preserved: Motion becomes the preferred orchestration engine only when
simple CSS/WAAPI no longer reaches the required interaction.

AutoAnimate is not introduced as a transversal dependency.

Release declaration:

`MOTION_LIBRARY_RELEASE_DECISION=DEFERRED_NATIVE_WAAPI_SUFFICIENT_RC61_1`

## Reduced motion

`prefers-reduced-motion: reduce` is authoritative.

When enabled:

- JavaScript does not call WAAPI;
- animation and transition durations are reduced to effectively zero;
- smooth scrolling is disabled;
- product state, information and confirmation remain available without motion.

Motion never carries information that is unavailable in static UI state.

## Architecture

The authenticated application owns the motion controller lifecycle.

The controller:

- attaches to the existing application root;
- observes existing session actions and filter controls;
- observes success/error, sync and empty/loading states;
- uses a bounded set of motion presets;
- destroys its listeners, observer and media-query listener on logout/rebuild.

There is no global auto-bootstrap side effect.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- external motion CDN: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC61.2 — Sync & Empty-State Orchestration.