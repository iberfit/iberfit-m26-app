# Exercise media pipeline

Automatic ingestion and publication pipeline for IBERFIT exercise visuals.

## Identity rule

`exercise_id` is the only authoritative identity. It must match the canonical catalog `id` exactly. Display names, aliases and filesystem slugs are never used to decide which exercise receives media.

A storage folder may be human-readable, but every asset path must remain under the namespace of its already-resolved canonical ID, for example `canonical-id/start.webp`.

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

The autowire validates this contract before emitting any upsert.

## Fail-closed behavior

The command stops without producing a valid publication payload when it finds an invalid or duplicate canonical ID, a missing/duplicate/unknown `exercise_id`, an invalid visual manifest, or an asset path assigned to another exercise namespace.

## Usage

```bash
node scripts/exercise-media/autowire.mjs \
  --catalog canonical-exercises.json \
  --manifest scripts/exercise-media/media-manifest.example.json \
  --out exercise-media-upserts.json
```

The output is deterministic in canonical catalog order and contains only exact-ID media updates plus a report of catalog exercises still missing media. No per-exercise manual matching is required.
