# RC63.2 — Network, Technical Analytics & Asset Governance

Date: 2026-08-17
Status: CLOSED

## Objective

RC63.2 closes the software rail for Exercise & Media Experience.

The release adds explicit network/error/retry behavior, deterministic speed and
PiP controls when supported, minimized technical analytics, asset-rights
governance, and hard no-store treatment for heavy video.

## Network and recovery

The native player presents explicit states for:

- idle;
- loading;
- ready;
- playing;
- buffering;
- error;
- ended;
- offline.

When the browser is offline, written technical guidance remains available and
the UI does not pretend that remote video can load.

A retry action calls `video.load()` only when network state is online.

## Playback controls

RC63.2 keeps native HTML5 media as the engine and adds explicit product-level
controls for:

- playback-rate cycling: 1x, 1.25x, 1.5x, 2x;
- Picture-in-Picture only when the browser exposes the native API.

No autoplay is introduced.

## Technical analytics

`exercise-media-observability.js` provides a bounded in-memory event buffer.

It records only:

- technical event type;
- generic video asset kind;
- player state;
- online/offline/unknown;
- sanitized media-error class;
- coarse load-latency bucket;
- local sequence number.

It does not record identity, exercise id, media URL, health, IRI, wearables,
training load, appointments or session payload.

No persistence or remote analytics transport is introduced.

## Asset governance

`docs/product/EXERCISE_MEDIA_ASSET_GOVERNANCE.md` becomes the release contract
for real media acceptance.

Every future rich-media item requires an explicit rights basis, internal source
reference, license label and review timestamp in addition to the existing
technical approval/publication/role gates.

Unknown rights fail closed.

## Caching

Technical video is explicitly excluded from service-worker storage even though
the broader exercise namespace remains cacheable for lightweight assets.

Hosting headers also mark `/public/iberfit/exercises/video/*` as `no-store`.

Caption tracks use revalidation. Posters retain the established image policy.

No `.mp4`, `.webm` or `.vtt` asset is added to the generated app shell.

## Player decision

Plyr is not adopted for the RC63 release.

There are zero real approved IBERFIT technical videos in the production
manifest, so there is no evidence that an additional player dependency improves
a real Client or Coach flow over the completed native controls.

The decision is explicitly revisitable when real approved assets exist.

Lottie is also not added because RC63 contains no concrete licensed animation
use case requiring it.

## Content truth

The production rich-media manifest remains intentionally empty.

Software RC63 is closed; real media population remains a content pipeline
pending real approved assets and is not represented as completed.

## Target-regression compatibility

The first complete RC63.2 target run reached 295 tests with 292 passing and
three failures.

All three were assertion compatibility issues, not product failures:

- the historical RC63.1 test pinned the transient player schema `v1` after
  RC63.2 intentionally advanced the native player contract to `v2`;
- the RC63.2 source assertion expected a non-optional `addEventListener` form
  while the implementation correctly uses optional chaining on the injected
  scope;
- the governance wording assertion did not tolerate the Markdown line wrap
  between “approved” and “IBERFIT”.

The tests are stabilized to the durable contract. No RC63.2 production code,
privacy behavior, caching behavior or authorization behavior is changed by this
compatibility correction.

## Safety

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- player analytics persistence: none;
- player analytics remote transmission: none;
- authorization widening: none;
- automatic prescription change: none;
- clinical classification: none.

Premium Report Parity remains mandatory for all formal reports at the IRI
Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC64 — Quality Platform.