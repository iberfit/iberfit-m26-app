# IBERFIT · P0 Free QA · exact SQL operator fix V2

## Diagnosis and recovery
The real QA Client A bootstrap returned HTTP 400 during the first activation of version 1. Supabase `postgres_logs` explicitly reported `operator is not unique: unknown - unknown` at the same timestamps (2026-11-02 03:53–03:54 UTC). The original v1 SQL used `item->'body'-'id'-'clientId'-...`, which PostgreSQL's operator parsing ambiguously typed. This is a real server execution defect, **not** an MFA/privacy failure. The flag was turned **false immediately** and a versioned QA-only rollback applied successfully: public bootstrap SQL returned to original MD5 `aedea9df3d4986496626e10318628c41`; no data rows changed, production never modified.

## Correction
The only functional SQL change in V2 is using `(item->'body') - ARRAY['id','clientId','status','revision','updatedAt']::text[]`. PostgreSQL 17 QA read-only probe confirmed the exact operator preserves unremoved fields, including `results`. See PostgreSQL JSONB operators documentation. All V2 SQL scripts share identical text of the corrected patch, and are source-hash guarded and QA-only.

The V1 migration and V1 rollback remain historical provenance and **MUST NOT** be reapplied. Reapply only `20261102051000_p0_free_qa_client_body_envelope_dedup_v2.sql` after source hash/flag check, with flag OFF; then deploy/certify same SHA, and enable only via guarded V2 enable script. First real test must verify that Client A gets `__iberfitQaClientBodyMetaV1` markers and preserves full history, results, feedback, planning, revision/owner and cold-login device coverage; Client B and Coach/Admin unaffected. No repeated browser runs on failure: disable first, then roll back V2. If run fails for reasons outside this exact SQL defect, investigate before any more changes.

## Conservation / measurement
Do not alter RLS, JWT, WebAuthn, grants, data or production. Pre-pilot Client A bootstrap baseline ~1,415,514 decoded JSON bytes, theoretical reduction 175,592 bytes decoded (not compressed wire, not billed Supabase Usage). `#1209` remains open until actual Billing/Egress shows 5GB Free caps respected and a safety margin under 4GB uncached.
