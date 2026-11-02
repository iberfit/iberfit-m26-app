# IBERFIT Supabase Free P0 · QA-only canonical envelope de-duplication v1

Status: **isolated candidate; SQL MIGRATION NOT APPLIED; feature OFF**. Anchor: Canary `b0f768ffddc8c77b1216d5b8a8ff81a26ab5331f`, QA `gjztkdwfmunnzhtvxrsu`; production `pjhmrhejsoofmouedavw` untouched.

### Evidence before implementing
READ-ONLY QA SQL for synthetic Client A showed all **1,158 of 1,158** canonical planning/session/execution bodies exactly repeat `id,clientId,status,revision,updatedAt` already present in the enclosing entity. Atomic SQL simulation (no writes, no client data output) compacts and restores **1,158/1,158 JSONB objects exactly**, saving **175,592 bytes** of decoded JSON per synthetic Client A bootstrap (66,966 executions + 64,860 sessions + 43,766 planning). This includes per-entity marker overhead. That is a theoretical decoded saving; **gzip/brotli/billed Egress may be MUCH lower**, no quota claim.

### Design
- Existing `public.iberfit_bootstrap_v26_rc29()` is patched ONLY on QA (function-source MD5 `a8bf53fd05478bb2face12edc642dccc` guard), under the exact authenticated synthetic Client A email, confirmed QA environment, and `free_client_body_envelope_compact_v1=true`. The migration creates no rollout flag and cannot apply to PROD. The default response is byte/behavior unchanged until explicit enablement.
- SQL emits a tiny `__iberfitQaClientBodyMetaV1:1` marker on an entity ONLY when all five body keys exactly match the enclosing entity. All other entities pass through unchanged. No row mutation and no RLS/grant/auth change. JSON array order retained via `WITH ORDINALITY`.
- `stateFromBootstrap` performs fail-closed marker validation **after existing authenticated snapshot validation and before any Coach summary reconstruction, canonical reconciliation, role projection or rendering**. Valid QA Client markers reconstruct the body exactly, including results, feedback, session timing and planning. A marker in PROD, other role/owner, inconsistent shape or conflict is an error, never silently skipped. Default marker-absent path unchanged for all users.
- No legacy collection removal, pagination adjustment, JWT caching, permission bypass, test skip or weakened SLA.

### Certification order, WIP=1
1. Node contract + Fast Lane + CI/Audit + Device + Auth + Canary Policy on exact commit. Keep PR DRAFT until first green. No extra browser E2E until checks.
2. Once source gates pass, review QA-only migration and rollback/flag files against actual DB function hashes and exact SQL execution plan. Apply migration to QA with flag OFF, verify no change with authenticated QA LIVE.
3. Then deploy only Canary front-end exact-SHA and (if security review approves) turn flag ON for synthetic Client A only. Pair real Client A full auth, pre-click progress, session 419+ and 419+ executions, history explicit click, Client B isolation, Coach/Admin WebAuthn, offline, account rotation, results/feedback/ACK and PWA/device gates. Confirm same output state and reduced HTTP decoded/wire bytes vs base. If anything fails, flip flag OFF and verify instant restoration; rollback DDL only with exact source hash.
4. Never promote PROD from this candidate or change plan. Certify organizational Free Usage separately (uncached/cached 5 GB caps, margin <4 GB uncached). Track #1209.
