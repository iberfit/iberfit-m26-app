Pipeline target: canonical catalog -> generated movement assets -> biomechanics/visual QA -> canonical visual manifest -> exact exercise_id validation -> deterministic storage namespace -> idempotent media upsert -> app runtime rendering.

Hard invariant: only the canonical catalog `id` and manifest `exercise_id` may establish identity. Names, aliases and slugs are non-authoritative and must never participate in matching. Unknown, duplicate or malformed IDs fail closed before publication.

Publication invariant: emitted media must validate against `iberfit.exercise.visual.v1`, use the `iberfit-exercise-media` bucket, remain inside the canonical exercise ID path namespace, have approved biomechanics and visual QA, and be explicitly published with client and/or coach visibility.

No per-exercise manual matching.
