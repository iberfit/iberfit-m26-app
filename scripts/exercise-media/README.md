# Exercise media pipeline

Automatic ingestion, publication and in-app linkage for IBERFIT exercise visuals.

## Identity rule

`exercise_id` is the only authoritative identity. It must match the canonical catalog `id` exactly. Display names, aliases and filesystem slugs are never used to decide which exercise receives media.

Every Storage path remains under the exact canonical ID namespace, for example `canonical-id/movement.webp`, `canonical-id/start.webp` and `canonical-id/end.webp`.

## Canonical visual contract

Every `media` payload must satisfy the runtime contract implemented in `src/m26/exercises/catalog.js`:

- schema: `iberfit.exercise.visual.v1`
- style: `iberfit-premium-movement-pair-v1`
- bucket: `iberfit-exercise-media`
- `movement` is mandatory
- biomechanics QA must be `approved`
- visual QA must be `approved`
- `published` must be `true`
- at least one of client or coach visibility must be enabled

## Automatic link to the library already shown in the app

No additional manual mapping is required in the UI. The production code already follows this path:

1. `iberfit_finalize_exercise_media_v1` writes the approved manifest into `exercise_catalog` and sets `media_status='aprobado'`.
2. `iberfit_exercise_media_manifest_v1` exposes only approved/published media with an exact exercise ID and safe Storage path.
3. `src/m26/library/exercise-media.js` loads that RPC dynamically and materializes the trusted Supabase Storage URL.
4. `src/m26/library/exercise-media-ui.js` renders that media in the exercise cards already used by the app library.
5. `src/m26/app/workflow-controller.js` builds the visible exercise library from those cards.

Therefore, once a generated asset is uploaded and finalized, it becomes visible automatically in the existing exercise library without editing the exercise card, catalog JSON or UI by hand.

## Autowire

```bash
node scripts/exercise-media/autowire.mjs \
  --catalog baseline_m25_2/exercise-catalog-m25.json \
  --manifest generated-media.json \
  --out exercise-media-finalizations.json
```

Autowire v3 emits only validated calls to `iberfit_finalize_exercise_media_v1`; it deliberately does not emit direct table upserts, because a raw `media_status=ready` would bypass the runtime publication contract and would not be visible through the existing media RPC.

## Publisher

Dry run is the default:

```bash
node scripts/exercise-media/publish.mjs \
  --plan exercise-media-finalizations.json \
  --target qa
```

Actual publication requires `--apply` plus credentials supplied through environment variables. QA and PROD origins are hard-pinned; PROD additionally requires `IBERFIT_ALLOW_PROD_MEDIA_PUBLISH=true`. Before finalizing, the publisher verifies that every referenced image exists in the `iberfit-exercise-media` bucket.

## Fail-closed behavior

The pipeline stops on malformed, duplicate or unknown exercise IDs; invalid visual manifests; cross-exercise paths; missing Storage assets; QA/PROD origin mismatch; unexpected RPC results; or production publication without the separate production allow flag.

The output order follows the canonical catalog deterministically. No per-exercise manual matching is required.
