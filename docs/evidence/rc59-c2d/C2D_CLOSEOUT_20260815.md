# RC59.0C2D - Migration history / reproducibility closeout

Date: 2026-08-15

Status: CLOSED_MIGRATION_HISTORY_ALIGNED

## Canonical repository state

- Branch: feature/rc58-design-system
- Commit: f33e664df8b4922682da72f9d66c4157cf152a79
- Canonical Supabase project ref: pjhmrhejsoofmouedavw
- Active migration count: 49
- Recorded July migrations represented locally: 47
- Recovered off-ledger core: 20260718130000_RECOVERED_OFF_LEDGER_m26_gate15_canary_core.sql
- Recovered core SHA256: b830e9b846a281f9bdfa633471fdec243fe4c8181b6090eb1a1850239fef2fc1
- Current production baseline: 20260815195022_RECOVERED_CURRENT_PRODUCTION_BASELINE.sql
- Current production baseline SHA256: a594ea928ea90bddfb2dc429b240cabb083518da60fcfa4962c2a18af3304ad2

## Replay proof

- Verified shadow replay chain: 47 recorded July migrations + recovered core + single current-production baseline.
- Final public actionable drift count: 0.
- Final pg-delta retry evidence SHA256: 7805a6065da60b6859171c80b28d9603f3f20bb688398264f626e88c9c39e081
- No repeat apply of RC59 telemetry was required.
- No rollback of RC59 telemetry was required.

## Migration history alignment

- Remote migration history count before repair: 47.
- Exact versions marked applied by guarded history repair:
  - 20260718130000
  - 20260815195022
- Remote migration history count after repair: 49.
- Remote-only versions after repair: 0.
- Local-only versions after repair: 0.
- Retired August versions present in remote history: 0.
- Post-repair db push dry-run left core pending: false.
- Post-repair db push dry-run left baseline pending: false.

## Retired migration evidence

The following historical August migration files remain preserved under
docs/evidence/rc59-c2d/retired-august-migrations and are not active migrations
or remote migration-history rows:

- 20260804061500_rc43_operational_backend.sql
- 20260804062500_rc43_1_session_draft_persistence.sql
- 20260804065000_rc44_zero_cost_wearables.sql
- 20260809063000_rc45_8_canonical_backend_promotion.sql
- 20260809185000_rc46_strict_coach_assignment_scope.sql
- 20260809230500_rc46_1_compatibility_closure.sql

## Mutation scope of final history repair

- Migration history mutation: exactly two rows marked applied.
- Remote schema mutation by repair script: false.
- Migration SQL executed on remote by repair script: false.
- Git mutation by repair script: false.

## Gate conclusion

RC59.0C2D is closed.

The canonical migration chain and remote migration history are aligned 49/49.
RC59.0C3 remote outbox upload runtime is unblocked and is the next active step.