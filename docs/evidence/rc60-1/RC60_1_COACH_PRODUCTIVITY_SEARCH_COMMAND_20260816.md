# RC60.1 — Coach Productivity · Search & Command Surface

Date: 2026-08-16
Status: CLOSED

## Scope

RC60.1 opens Coach Productivity without pretending the complete RC60 roadmap is
finished.

This increment delivers:

- tolerant client search with Fuse.js;
- global Coach/Admin command palette;
- keyboard shortcut Ctrl/Command + K;
- quick navigation inside the user's already-authorized surface;
- client opening from the palette;
- device-local saved client views;
- device-local recent clients.

RC60 remains IN_PROGRESS. Large-list virtualization, session reuse/templates,
ordering and safe bulk operations remain in later RC60 increments.

## Fuse.js

IBERFIT vendors the Fuse.js basic ESM build, version 7.5.0, from the official
`krisk/Fuse` v7.5.0 tag.

The runtime copy is same-origin and precached with the application shell.
No CDN runtime dependency is introduced.
The upstream Apache-2.0 license is preserved beside the vendored asset.

## Client search

The existing exact filters remain authoritative for:

- IRI state;
- modality;
- follow-up stage.

When the text query is non-empty, Fuse.js ranks only clients that already pass
those filters. Search never expands the authorization scope: it receives only
the client records already visible in the authenticated application state.

When the query is empty, the existing priority/name ordering remains available.

## Command palette

The palette indexes only:

- navigation areas already rendered for the current role;
- client records already present in the role-scoped state.

It does not invent commands, bypass route guards or call the backend directly.
Opening a client or area continues through the existing shell controls.

## Saved views and recents

Saved views contain only operational UI preferences:

- query;
- IRI filter;
- modality filter;
- stage filter;
- sort mode.

Recent items contain only client identifiers already visible to the signed-in
user. Storage is namespaced by authenticated owner id and capped.

No wearable values, health metrics, private notes or clinical content are
written to this productivity storage.

## Regression compatibility

The complete legacy suite exposed one RC28 assertion pinned to the former exact
status copy `1 cliente encontrado`. RC60.1 intentionally keeps the same count
and live announcement while adding `con búsqueda tolerante.` to describe the
new typo-tolerant behavior.

This resume updates only that historical test expectation. RC60.1 production
search, authorization, persistence and command behavior are unchanged.

## Safety / dependencies

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- Fuse runtime CDN: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

## Product rails preserved

Premium Report Parity remains mandatory for every formal IBERFIT report at the
IRI Premium reference level.

RC59.2 Health Connect physical E2E remains independently pending on a real
Android device with source data.

## Next

RC60.2 — Large-list & Reuse:

- measured virtualization only when dataset size justifies it;
- session duplicate/reuse;
- templates and versions;
- preparation for later ordering and safe bulk operations.