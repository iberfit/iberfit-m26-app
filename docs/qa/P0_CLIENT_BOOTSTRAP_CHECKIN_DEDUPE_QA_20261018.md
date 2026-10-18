# P0 Client bootstrap check-in dedupe — QA 2026-10-18

## Trigger

The authenticated Device Experience gate reproduced a real Client bootstrap failure on mobile. PostgreSQL returned SQLSTATE 57014 after the authenticated 8 s statement timeout; the failing RPC lasted about 8.87 s. This is a backend bootstrap performance defect, not a viewport/CSS defect.

## Root cause evidence

For the heavy QA Client, \`iberfit_bootstrap_v26()\` was about 1.96 MB. The same 1,045 confirmed check-ins were present twice:
- canonical \`data.checkins\`: about 593 KB;
- \`data.m26Entities\` entries with \`entityType=checkin\`: about 785 KB.

The two sets were verified 1:1 by id: 1,045/1,045, with 0 entity-only rows, 0 canonical-only rows, 0 revision mismatches and 0 status mismatches. \`remoteRevisions\` is intentionally preserved.

Frontend reconciliation consumes \`m26Entities\` for canonical planning/session/session_execution records. Check-in history uses the dedicated \`checkins\` collection. The P0 change therefore removes only the duplicate Client \`checkin\` envelopes from \`m26Entities\`; Admin and Coach output is unchanged by the role guard.

## QA migration

Supabase QA ledger:
- version: \`20261018220813\`
- name: \`p0_client_bootstrap_checkin_dedupe_v1\`
- installed \`iberfit_bootstrap_v26_rc29()\` MD5: \`8896151785169af347449df0c5199709\`
- prior MD5: \`f96b4594e4fe49a1d82e04cbb0cbc65f\`

Security metadata remained unchanged: owner \`postgres\`, \`STABLE SECURITY DEFINER\`, \`search_path=''\`, ACL \`postgres=X/postgres,service_role=X/postgres\`.

## Measured result

Transactional candidate before installation:
- baseline: 3,105.86 ms / 3,558.26 ms, 1,960,028 bytes;
- candidate: 1,174.54 ms / 1,107.10 ms, 1,174,168 bytes;
- all data outside \`m26Entities\` had the same stable hash;
- all non-checkin \`m26Entities\` had the same stable hash.

Installed QA, with the real authenticated \`statement_timeout=8s\`, five sequential runs:
- 1,059.75 ms
- 999.44 ms
- 962.72 ms
- 945.12 ms
- 992.20 ms

Each returned 1,174,168 bytes, 230 non-checkin \`m26Entities\`, 0 duplicate checkin entities, 1,045 canonical check-ins and 1,275 remote revisions.

This evidence is QA-only. Production remains untouched until the exact PR/Canary candidate completes authenticated Device/remote gates and the protected backend promotion path is certified.
