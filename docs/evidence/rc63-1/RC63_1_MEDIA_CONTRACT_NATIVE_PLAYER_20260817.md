# RC63.1 — Media Contract & Native Player Foundation

Date: 2026-08-17
Status: CLOSED

## Objective

RC63.1 establishes the exercise rich-media contract and an accessible native
HTML5 video foundation without fabricating exercise videos or introducing a new
player dependency before real approved assets exist.

RC63 remains open. Network behavior, technical analytics and asset-governance
closeout continue in RC63.2.

## Existing media preserved

The existing IBERFIT v1 image manifest remains unchanged and valid.

The existing RepDB image fallback remains unchanged and keeps its attribution.

RC63.1 adds a separate IBERFIT v2 rich-media manifest so historical image
contracts do not need a silent schema mutation.

## Rich-media contract

Approved v2 entries may define:

- one same-origin technical video (`.mp4` or `.webm`);
- one same-origin poster;
- WebVTT caption tracks;
- title and alternative description;
- cues;
- common errors;
- regressions;
- role visibility;
- review and publication state.

Client and Coach resolution remains fail-closed: rich media must be technically
approved, published and visible to the active role.

Remote URLs, data URLs and arbitrary paths are not accepted as IBERFIT technical
video assets.

## Player decision

RC63.1 uses native HTML5 `<video>`.

The native foundation provides:

- browser controls;
- inline playback;
- controlled `preload="none"`;
- poster;
- WebVTT captions;
- written fallback;
- no autoplay;
- no inline event handlers.

Plyr is not added in RC63.1. The decision is intentionally deferred until
IBERFIT has real approved video assets and can compare the native experience
against the additional dependency on actual Client/Coach use cases.

This is a release decision, not a permanent ban on Plyr.

## Asset truth

The production v2 manifest intentionally contains zero approved/published video
items at RC63.1.

IBERFIT does not create fictional exercise videos merely to make the UI appear
complete.

Actual exercise media must pass provenance/licensing and human technical review
before publication.

## App-shell generator compatibility

The first RC63.1 implementation run correctly staged the new rich-media
manifest and native player before regenerating the PWA shell.

The player entered the generated shell automatically because it lives under
`src/m26`. The v2 manifest did not, because the RC58 generator only discovers
tracked files automatically under `src/m26` and `public/m26`; static assets
under `public/iberfit` are admitted through its explicit
`REQUIRED_STATIC_PATHS` contract.

RC63.1 therefore extends that explicit required-static list with
`public/iberfit/exercises/iberfit-exercise-media-v2.json` and regenerates the
shell. This preserves the generator architecture instead of hard-coding a
manual APP_SHELL edit.

## Offline and network scope

The v2 manifest and native-player runtime are part of the same-origin PWA shell.

Heavy video files are not added to the app shell in RC63.1.

Explicit network/offline state handling and media-error technical analytics are
part of RC63.2.

## Privacy and safety

RC63.1 introduces no player analytics.

It stores no:

- health data;
- identity;
- IRI data;
- wearable values;
- training load;
- appointment payload.

There is no backend write surface and no authorization widening.

## Release rails

- remote schema mutation: none;
- migration-history mutation: none;
- production data write: none;
- npm dependency mutation: none;
- package-lock mutation: none;
- Plyr added: no;
- automatic prescription change: none;
- clinical classification: none.

Premium Report Parity remains mandatory for all formal reports at the IRI
Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC63.2 — Network, Technical Analytics & Asset Governance.