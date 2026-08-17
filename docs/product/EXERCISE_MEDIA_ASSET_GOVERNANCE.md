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