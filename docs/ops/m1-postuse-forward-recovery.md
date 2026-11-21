# M1 / M44 — Recovery after first use

Current U60/U72/overlay rollback is intentionally fail-closed once dates have been published or dated training has been persisted. Never remove the guards, delete data, or revoke the only progress/finish RPC while a workout is active.

## Before the only production cutover

Certify the exact Canary SHA; real U71 linked-date and U74 no-appointment E2E; negative Client B / RLS; fresh encrypted DB + Storage offsite backup and verified PostgreSQL 17 restoration. FULL recovery must additionally prove usable hosted Auth, JWT signing, Vault, SMTP, Edge and secrets. A local PG17 restoration is not a managed-project reconstruction. Use one protected transactional U72 > autonomous overlay > U60 grant, then exact compatible frontend, real acceptance and restore evidence.

## After first use

Do not execute pre-use rollback. Freeze NEW creation and starts using a reviewed server-side compatible forward fix; do not interrupt existing pause, resume, progress and finish. Preserve encrypted offline journals, operation IDs and revision receipts. Compare integrity of occurrences, typed executions, domain execution records, active locks, permissions and RLS. Deploy a versioned compatible forward repair verified against the retained history, then recheck Client, Coach and A/B separation. Never change Auth, storage or existing user data in a recovery drill without an isolated copy.

The exact read-only post-use gate is scripts/release/m1_postuse_recovery_gate.mjs. It emits only aggregated counts, not identifiers or client results. FORWARD_ONLY_PRESERVE_HISTORY means conventional rollback is forbidden. PRE_USE_CANDIDATE_ONLY is not a promise that rollback is safe; fingerprints, admission locks, M44 recovery and other independent requirements still apply. The gate intentionally returns fullPlatformRecoveryCertified=false and productionMutationAuthorized=false for all results.

This control protects the release boundary; it does not by itself certify a post-fault fix or full managed-platform restoration. PROD activation remains gated independently.
