# P0 IBERFIT · Supabase Free QA Client A ejecución histórica diferida (16-11-2026)
## Fuente, aislamiento y reversibilidad
- ONLY Supabase QA `gjztkdwfmunnzhtvxrsu`, never production. No row deletes, updates, grants or role changes in migration.
- Source guard: `rc29 6e738331104794833987e82b6b6d105f` -> `88220acc54e26bb1ee91332d9b89a3b3`; outer `5d3e13ffc4f00c1e5f29d61fb81cd6e3` -> `0813cbe612bf24b2f08f99bf42a96662`. Each definition, owner, SECURITY DEFINER, volatility and ACL are verified atomically or entire migration rolls back.
- Opt-in setting `free_client_completed_execution_details_demand_qa_v1` **absent/OFF by default**, independent QA-only enable/disable scripts and full definition rollback.
- Only existing synthetic QA Client A has history demand feature; explicit QA environment, verified server role, client owner and unchanged page RPC hash `ae01c1771319b99f0404612a4b84fd2a`.
## Read-only baseline (before)
- QA Client A: 716 completed `session_execution`, retain latest 12 full, 704 older eligible for owner-scoped paged history and exact metadata parity.
- Sampled 704 old safe JSON: 650655 bytes; compact projected: 284922 bytes (~56.2% smaller). **This is projection, not actual egress or p95.**
- Genuine browser payload before: approximately 2.05 MB decoded and 354 KB on-the-wire for bootstrap A in Device run #43802580303; latency outlier 6113 ms, UI after ~11.5 s. Retried unchanged job SUCCESS, proving intermittent outlier.
- All 704 old rows have body id/clientId/revision parity and linked visible session; all scalar safe fields (except the four intentionally deferred heavy fields) matched in read-only comparison.
## Exact behavior
- Only old completed QA A execution `results`, `feedback`, `sourceSnapshot`, `planSnapshot` defer as empty structures on initial bootstrap, never write to source rows. 12 latest remain unchanged.
- All execution IDs, client ownership, status, revision, dates and safe metadata remain. Any hidden/orphan/invalid row uses original sanitizer untouched. Cross-user access remains enforced by existing scope.
- Explicit Client historical action uses **existing** `iberfit_client_completed_history_page_free_v1` with owner + snapshot fingerprint and full pagination; no special server-row projection on this reader. Stale/login-switch or incomplete histories fail closed.
## Acceptance
1. Source hashes/ACL and rollout guard verified QA only.
2. Manual read-only parity and history page readback, no data changes.
3. CI/full tests and real Client A/B, Coach/Admin, device 320/tablet/desktop after switch.
4. Record true decoded/wire payload + timings and compare with preflight before calling this a realized saving.
5. Disable flag immediately, then restore function definitions via guarded rollback on regressions. PROD remains NO-GO.
