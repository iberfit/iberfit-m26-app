# RC60.2B — Virtualization Decision & Bulk Preparation

Date: 2026-08-17
Status: CLOSED

## Virtualization release decision

RC60.2A established runtime measurement but the release evidence available at
this point does not contain repeated field measurements demonstrating that the
existing client list exceeds both the size threshold and the update-time budget.

The release decision for RC60 is therefore:

`TANSTACK_VIRTUAL_RELEASE_DECISION=DEFERRED_NO_FIELD_EVIDENCE`

Synthetic large-list tests are useful regression evidence but are not treated as
proof that a runtime dependency is required in the product.

The policy can classify a future virtualization candidate only after at least
three runtime measurements all exceed the existing threshold:

- at least 120 client cards; and
- at least 24 ms measured list update time.

Even then, the policy returns a release candidate rather than automatically
loading or installing a virtualization dependency.

TanStack Virtual Core is not added in RC60.

## Bulk preparation

RC60.2B adds a pure bulk-preparation contract for the client portfolio.

Supported initial actions:

- resend invitation;
- suspend access;
- reactivate access.

The contract:

- requires at least two selected clients;
- caps one prepared operation at 25 clients;
- accepts only clients already present in the visible authorized scope;
- preserves visible portfolio ordering;
- requires a reason for actions whose canonical command requires one;
- requires an exact human confirmation token;
- never executes automatically;
- never calls transport, Command Bus or Supabase directly.

The output is a prepared list of canonical command drafts for a later explicit
execution surface. This release does not introduce silent or one-click mass
mutation.

## Ordering and accessibility

Existing conventional session ordering remains unchanged:

- Move up;
- Move down;
- keyboard-accessible buttons;
- non-virtualized DOM remains the accessible fallback.

## Target-regression compatibility

Closing RC60 changes the current roadmap state from `IN_PROGRESS` to `CLOSED`.
Two older tests (RC59.6 and RC60.1) still asserted the transient current state
`RC60=IN_PROGRESS_COACH_PRODUCTIVITY`.

Those assertions are not product behavior. They are now stabilized to each
phase's durable historical close marker plus the cross-cutting Premium Report
Parity and Health Connect physical-E2E rails.

No RC60.2B production implementation is changed by this compatibility patch.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- TanStack Virtual runtime dependency: none;
- automatic bulk execution: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## RC60 closeout

RC60 Coach Productivity is closed with:

- RC60.1 Search & Command Surface;
- RC60.2A Session Reuse, Versioned Templates & Measurement;
- RC60.2B Virtualization Decision & Bulk Preparation.

Next active rail:

RC61 — Motion & Microinteractions.