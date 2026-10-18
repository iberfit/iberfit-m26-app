# P0 Client bootstrap check-in dedupe — QA/PROD evidence 2026-10-18

## Trigger
Authenticated Device Experience reproduced a real Client mobile bootstrap failure: HTTP 500 after ~8.87 s, matching PostgreSQL SQLSTATE 57014 under the existing authenticated 8 s statement timeout. The timeout is not raised.

## QA root cause
The heavy QA Client bootstrap was about 1.96 MB. The same 1,045 check-ins were present in canonical `data.checkins` (~593 KB) and again as `m26Entities` check-in envelopes (~785 KB).

Safety comparison was 1:1: 1,045/1,045, 0 entity-only, 0 canonical-only, 0 revision mismatches, 0 status mismatches. `remoteRevisions` remains intact. Admin and Coach were also compared transactionally against the no-dedupe variant and produced exact JSON equality.

## QA candidate
QA ledger version `20261018220813`, installed rc29 MD5 `8896151785169af347449df0c5199709`, prior QA rc29 MD5 `f96b4594e4fe49a1d82e04cbb0cbc65f`.

Five installed-QA runs under the real authenticated 8 s timeout: 1,059.75 / 999.44 / 962.72 / 945.12 / 992.20 ms. Payload: 1,174,168 bytes, 230 non-checkin m26Entities, 0 duplicate checkin entities, 1,045 canonical check-ins, 1,275 remote revisions.

Device Experience run 39169772053 attempt 2 is SUCCESS after the QA correction; the exact authenticated task step that previously failed now passes on the same frontend SHA.

## PROD compatibility
PROD intentionally does not contain QA-private rc29 scope candidates. Read-only PROD baseline:
- rc29 MD5 `5c565986e5946e768cd84eb0398f76cb`;
- pre_v65e MD5 `115246a2fb1aea298d023e44508c7dba`;
- role/access normalized hashes match Stage 2 baselines.

The production migration therefore starts from the exact PROD rc29 and adds only:
`and (v_role not in ('client','cliente') or e.entity_type <> 'checkin')`

No QA-private publication/privacy filters are promoted by this migration. Candidate PROD-style rc29 MD5: `e62108e529544f3987e1be3f5ba1a2e2`.

Transient QA execution using the exact PROD definition:
- baseline: 1,624.23 / 1,436.93 ms, 1,960,028 bytes;
- candidate: 1,198.02 / 1,309.43 ms, 1,174,168 bytes;
- stable hash outside m26Entities identical;
- stable hash of every non-checkin m26Entity identical;
- canonical check-ins remain 1,045.

This is non-destructive and reversible, but PROD remains untouched until the exact PR/Canary candidate completes all protected gates and the data migration is explicitly applied with fresh recovery authority.
