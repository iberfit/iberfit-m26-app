# RC62.1 — Agenda Standard

Date: 2026-08-17
Status: CLOSED

## Objective

RC62.1 upgrades the Coach agenda from a card-only operational list to a
day/week calendar while preserving the existing appointment cards as the
accessible and mobile fallback.

This increment does not close RC62. Guidance and progressive onboarding remain
separate increments.

## FullCalendar package decision

FullCalendar Standard 7.0.2 is vendored from the official pinned npm package
and served same-origin.

V1 had already verified the official GitHub release ZIP digest, but that ZIP
did not expose the documented `all/global.js` package suffix on the Windows
extraction path. It failed before any repository mutation.

V2 therefore uses FullCalendar's other documented acquisition route:
`fullcalendar@7.0.2` from the official npm registry.

The package tarball is verified before any repo write against both metadata
returned by npm for that exact package artifact:

- SHA-1 registry shasum;
- SHA-512 registry integrity.

Only Standard assets are used. FullCalendar Premium / Scheduler, resource
timeline views and `schedulerLicenseKey` are not introduced.

The Standard bundle remains under the upstream MIT license, copied with the
vendored assets.

## Product scope

The calendar is Coach-first, matching the RC62 roadmap.

Client and Admin keep their existing agenda presentation in RC62.1.

Coach receives:

- `timeGridWeek` as the initial view;
- optional `timeGridDay`;
- Chilean time zone (`America/Santiago`);
- Spanish locale;
- Monday as first day;
- focusable events;
- today/previous/next controls;
- a visible appointment-card fallback below the calendar.

## Non-mutating calendar contract

RC62.1 is a visualization and navigation layer.

The calendar explicitly keeps:

- `editable:false`;
- `selectable:false`;
- `eventStartEditable:false`;
- `eventDurationEditable:false`.

Clicking an event only focuses the corresponding existing appointment card.
It does not create, reprogram, cancel, confirm or publish anything.

All appointment mutations continue through the existing canonical RC39 and
Command Bus paths.

## Privacy and scope

The FullCalendar event projection is deliberately compact:

- appointment id;
- title;
- start/end;
- normalized status;
- normalized modality.

Client ids, health data and arbitrary appointment payload fields are not copied
into the calendar event model.

Coach continues to receive only the already-authorized store projection.

## Accessibility and responsive behavior

FullCalendar events are configured as interactive/focusable.

The existing semantic appointment cards remain in the DOM as the source for
full operational detail and actions.

On narrow mobile screens the dense calendar panel is hidden and the existing
card agenda remains the primary experience.

No calendar information exists only as color.

## Supply chain

Runtime assets are same-origin. No CDN is called by the application.

`package.json` and `package-lock.json` remain unchanged.

The vendoring script verifies the official release ZIP digest before any file
is copied into the repository.

## Vendor-byte integrity gate

The upstream FullCalendar Standard files are preserved byte-for-byte after
verification against the official pinned `fullcalendar@7.0.2` npm artifact.

Some upstream distribution files contain trailing whitespace. IBERFIT does not
rewrite those verified third-party bytes merely to satisfy repository
whitespace style checks.

`git diff --check` remains mandatory for IBERFIT-authored changes. The exact
upstream vendor files are excluded from that formatting-only check and instead
pass the stronger byte-identity gate against the verified package artifact.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- Premium Scheduler dependency: none;
- resource timeline dependency: none;
- direct backend mutation from calendar: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC62.2 — Contextual Guidance.