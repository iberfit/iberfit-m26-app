# RC60.2A — Large-list & Reuse · Reuse + Measurement

Date: 2026-08-16
Status: CLOSED

## Why this is RC60.2A rather than a premature RC60.2 close

The approved roadmap says list virtualization must be driven by measured need,
not installed by default. RC60.2A therefore closes the reuse/template half and
adds runtime measurement for the existing client list before introducing a
virtualization dependency.

RC60.2 remains IN_PROGRESS.

## Session reuse

Coach/Admin can open an existing session as a new independent draft.

The reuse contract:

- creates a new session id;
- creates new block ids;
- targets only the currently visible client context;
- resets revision to zero;
- resets publication preview acceptance;
- does not carry publishedAt / visibleToClient state;
- copies only known training-prescription fields;
- never mutates the source session.

## Versioned templates

The session builder can save and load reusable templates.

Templates are:

- owner-scoped;
- device-local;
- capped to 20 template names;
- capped to the latest 5 versions per template;
- free of clientId and arbitrary health/private fields;
- instantiated as a fresh draft for the current visible client.

They are productivity assets, not backend truth. Publication still goes through
the existing preview and SESION_PUBLICAR path.

## Large-list measurement

The existing client list records:

- total item count;
- visible item count;
- measured update duration;
- whether virtualization is recommended by the current policy.

Candidate policy for the next decision gate:

- at least 120 items; and
- measured update duration at or above 24 ms.

Both conditions are required. A large but fast list or a small but slow isolated
measurement does not automatically add a virtualization runtime dependency.

## Dependency decision

TanStack Virtual Core is intentionally NOT added in RC60.2A.

RC60.2B will use runtime evidence plus synthetic large-list regression to decide
whether to vendor it. If adopted, it must be same-origin, pinned and preserve a
non-virtualized accessible fallback.

## Full-regression compatibility

The first complete regression after RC60.2A exposed three failures.

Two failures (RC8 and RC14) identified a real integration omission: the new
`load-template` and `save-template` session controls were handled by the session
controller but had not been added to the central interactive-action registry.
They are now registered for Coach/Admin under the session domain and are covered
by a dedicated RC60.2A audit regression.

The RC43.1 failure was a stale static source assertion. Remote draft recovery is
still called when the builder is opened normally; session reuse intentionally
skips loading a pre-existing draft so the explicitly selected source session can
become the independent draft. The historical assertion now reflects that
conditional call without changing production behavior.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- authorization widening: none;
- source session mutation: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory at IRI Premium level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC60.2B — Virtualization Decision & Bulk Preparation.