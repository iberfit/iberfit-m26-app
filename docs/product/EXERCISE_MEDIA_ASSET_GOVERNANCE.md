# IBERFIT Exercise Media Asset Governance

Status: RELEASE CONTRACT
Version: 1.0
Applies from: RC63.2

## Purpose

This contract governs acceptance of real IBERFIT exercise-media assets.

Software capability and asset population are separate. A technically valid
player does not authorize publication of an exercise video.

## Allowed rights basis

Every IBERFIT rich-media item must declare exactly one rights basis:

- `iberfit_owned`: created and owned by IBERFIT;
- `commissioned`: created for IBERFIT under a rights-transfer or use agreement;
- `licensed`: third-party asset covered by an explicit license compatible with
  the intended Client/Coach use;
- `public_domain`: public-domain status has been verified and documented.

`unknown` or an omitted rights basis is never publishable.

## Required provenance fields

Each rich-media item must contain `asset_provenance` with:

- `rights_basis`;
- `source_ref`: an internal evidence or contract reference, not a person name;
- `license_label`: concise rights/licensing label suitable for audit;
- `reviewed_at`: valid ISO timestamp of the rights review.

These fields do not replace technical review. `review_status=approved`,
`published=true`, role visibility and safe same-origin paths remain mandatory.

## Technical video acceptance

Accepted runtime paths are same-origin and restricted to the canonical IBERFIT
exercise-media namespaces.

A video is publishable only when:

1. provenance is valid;
2. technical review is approved;
3. publication is explicit;
4. role visibility is explicit;
5. written guidance exists when required by the exercise contract;
6. captions are supplied when speech or meaningful audio carries information.

## Prohibited sources

Do not publish:

- scraped social-media videos;
- assets with unknown rights;
- hotlinked third-party runtime URLs;
- data URLs or blob URLs in manifests;
- content copied from a platform merely because it is publicly viewable;
- assets whose license cannot be tied to an auditable evidence reference.

## Runtime privacy

The player may collect only minimized technical events needed to understand
load/error behavior.

RC63.2 technical analytics are memory-only and exclude:

- user identity;
- client identity;
- exercise id;
- video URL;
- health data;
- IRI data;
- wearable data;
- training load;
- appointment or session payload.

## Caching

Heavy technical video files are not part of the PWA app shell and are
explicitly excluded from service-worker storage.

The hosting header contract also marks the video namespace `no-store`.

Posters may use the existing immutable image policy. Caption files are
revalidated rather than treated as immutable.

## Player dependency decision

RC63 closes on the native HTML5 player.

Plyr is not adopted in this release because there are zero real approved
IBERFIT videos with which to demonstrate a user-experience benefit that
justifies an additional runtime dependency.

This decision must be revisited when real approved assets exist if native
controls fail a documented Client/Coach use case.

## Content population

At RC63 closeout, the production rich-media manifest contains zero fabricated
approved videos.

Real asset population remains an explicit content pipeline:
provenance -> technical review -> publication -> role visibility.

The absence of fabricated assets is a safety property, not an assertion that
the content library is complete.
## Media 360 · image and video per canonical exercise

The existing image and rich-media manifests share the exact canonical exercise
ID. Approved videos are delivered by Cloudflare Pages, not the Supabase
authenticated bootstrap or Storage. The original image remains the default;
the same shared component provides Imagen / Vídeo / Ambos in Coach/Admin
library and guided legacy/dated workouts. Thumbnails remain lightweight.
The native video element is created only after explicit choice, paused and
removed when returning to the image. No autoplay, no new RPC, no extra
runtime dependency, no speculative preloading of upcoming exercises.

For each manually approved video, place the MP4 (H.264, broadly compatible,
prefer a short silent full repetition, fast-start, target <=4 MiB) or WebM
in `public/iberfit/exercises/video/<exact-exercise-id>/technical-v1.mp4`.
Append a v2 item with the exact ID, technical_video.src, optional verified
poster/captions, approved written cues, asset_provenance and explicit approved
review/publication/role flags. Increment summary counts in the same protected
commit as the real asset. Never associate by translated name or fabricate an
approved asset. A review of the actual video, correct movement, visual match,
equipment and ownership is mandatory. Existing image publication stays
independent. Batch new approved content through protected releases without
creating a second exercise catalog or a paid video service.
