# IBERFIT P0 · Authenticated Client bootstrap · QA evidence (2026-10-17)

## Scope and trace

- Canary baseline: `069ba68298dd57181a62cc88ce6c31112ac92176`.
- PR owner: [#1017](https://github.com/iberfit/iberfit-m26-app/pull/1017), **Draft**.
- Confirmed failure: [Device Experience Gate #39070288058](https://github.com/iberfit/iberfit-m26-app/actions/runs/39070288058): Chromium tablet landscape, CPU 6×, Client A, `iberfit_bootstrap_v26` **9298 ms / HTTP 500**. SQLSTATE `57014`, PostgreSQL statement timeout; other auth/role RPCs were 200.
- SQL chain: `public.iberfit_bootstrap_v26_rc29()` → `pre_v65e()` → `pre_person_service_v1()` → `public.iberfit_bootstrap_v26()`. No evidence of a WebAuthn bypass or a permanent frontend render deadlock.
- Production has **not** received this migration. The PR must not be merged based on sporadic green reruns.

## QA-only isolated candidate

An independent `private.iberfit_bootstrap_v26_rc29_slim_qa()` candidate and its private chain were installed in **iberfit-qa only**. Their `anon`/`authenticated` EXECUTE access is revoked. Subsequently the guarded migration was applied to the **public rc29 function in Supabase QA only**, at migration version `20261017220957`; PROD remains unchanged. No table data, RLS, role grants, WebAuthn, API keys or PWA deployment changed.

Current public `rc29` definition MD5: `5c565986e5946e768cd84eb0398f76cb`.
Optimized function **body** MD5: `722040e7807a52a70339277014026833`. Exact fail-closed guards appear in the migration and rollback.

The candidate moves two transformations earlier **for Client only**:
1. Internal `domainEvents` that the final Client API projection invariably removes are not assembled.
2. Entity rows ultimately suppressed by the existing M43/M44 privacy and publication rules are not serialized in the large intermediate snapshot.

This is not a new visibility policy. It retains all published sessions, executions and supported Client/Coach/Admin data and keeps the original role-specific output unchanged at the API boundary.

## Parity and measured size (QA synthetic fixtures)

| Identity | Contract | Result |
|---|---|---|
| Client A, data-heavy | Complete final public bootstrap vs full private candidate | **JSONB exactly equal**; final 1,698,145 bytes in each |
| Client B | Complete final public bootstrap vs full private candidate | **JSONB exactly equal**; final 4,243 bytes in each |
| Coach | Original `rc29` vs candidate `rc29` | **JSONB exactly equal**, including internal data |
| Admin | Original `rc29` vs candidate `rc29` | **JSONB exactly equal**, including internal data |
| Coach/Admin final bootstrap without a valid WebAuthn assertion | Fail-closed behavior | Both protected by `IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED`; no bypass attempted |

For Client A the core intermediate JSON shrank from **5,359,626** to **4,031,595 bytes**. Internal `domainEvents` went from **1,943** rows to **0**, and `m26Entities` from **1,368** rows to **1,251**; **the final Client JSON remained exactly equal**.

### Three paired QA SQL timings

| Iteration | Current full bootstrap | QA private candidate |
|---|---:|---:|
| 1 | 1,966 ms | 1,394 ms |
| 2 | 1,599 ms | 1,388 ms |
| 3 | 2,025 ms | 1,262 ms |

Medians: **1,966 ms** current vs **1,388 ms** candidate, approximately **29% lower** in these samples. These are sequential synthetic QA timings, not representative p95/p99 load certification and not proof that the 10s browser SLA cannot fail under concurrency.

An earlier candidate that computed one global authorized-client union was **rejected** after proving slower in QA; it was never wired to the public function.



## Verified post-install Device Experience Gate and bounded QA concurrency

- [Device Experience Gate #39070288058, attempt 3](https://github.com/iberfit/iberfit-m26-app/actions/runs/39070288058): **SUCCESS**, six jobs successful. Note this was run against historical diagnostic commit `c3209aa...` **with the newly optimized public QA backend**; it is not the final HEAD PR code certification.
- Authenticated Chromium/Coach/Client matrix: **4/4 passed** (desktop, tablet portrait, tablet landscape, mobile) under the configured tablet/mobile CPU 6×.
- Client A authenticated bootstrap RPC durations: **2,177 / 2,273 / 3,175 / 4,601 ms**, all HTTP 200. Client A interactive shell: **3,133 / 4,195 / 5,216 / 6,777 ms** respectively, all below the existing 10,000 ms threshold. Client B also passed in all four profiles.
- Guided welcome and authenticated visual capture: **4/4 passed each**. The unrelated [PR #1019 gate](https://github.com/iberfit/iberfit-m26-app/actions/runs/39074196274) independently passed authenticated Client/Coach with the same QA backend.
- Extra **16/16 read-only authenticated-role SQL calls succeeded** across QA synthetic Clients A/B, including 8 calls under a stricter **8-second per-transaction statement timeout**. Worst measured execution **1,742 ms**. No global timeout or server policy was increased.
- PostgreSQL/PostgREST QA logs queried after the guarded QA migration did not report `statement timeout`/`57014` within the observed interval. This is a bounded observation, not proof of permanent absence.

The production recovery prerequisite remains unsatisfied: the gate reports `PROD_BACKUP_COMPLETED_BACKUP_MISSING` and `M44_OFFSITE_RUN_TOO_OLD`. A schema-only catalog snapshot is not an independent restorable database backup. **No PROD DDL, merges, WebAuthn relaxation, or expanded grants were performed.**

## PROD/QA chain compatibility certification — baseline SQL from live PROD catalog

Supabase live catalog comparison identified **two different versions of `pre_v65e`**:

| Function | QA definition MD5 | PROD definition MD5 |
|---|---|---|
| `iberfit_bootstrap_v26_rc29()` | `f96b4594e4fe49a1d82e04cbb0cbc65f` (optimized) | `5c565986e5946e768cd84eb0398f76cb` (original) |
| `iberfit_bootstrap_v26_pre_v65e()` | `7416e0d52d6fa069cf467e95420d4034` (#1006) | `115246a2fb1aea298d023e44508c7dba` (original) |
| `iberfit_bootstrap_v26_pre_person_service_v1()` | `f7f30204f8e84e1d5c9fe43331b7f0c8` | Same |
| `iberfit_bootstrap_v26()` | `aedea9df3d4986496626e10318628c41` | Same |

To test the *actual original PROD `pre_v65e` definition* with QA synthetic data, its function source was retrieved read-only from PROD catalog and copied into a **private, non-exposed QA schema**, with `anon`, `authenticated` and `service_role` EXECUTE denied. The other two complete bootstrap wrappers were cloned privately with exact-definition guards and only their single dependency replaced. This does not alter any public QA/PROD RPC or production records.

- `pre_v65e` QA vs PROD-compatible private replica: **JSONB identical for Client A, Client B, Coach, Admin**.
- Complete final public bootstrap QA vs PROD-compatible full private chain: **JSONB identical for Client A and Client B**, including lifecycle, training service and privacy projections.
- Protected Coach/Admin final bootstrap cannot be simulated without valid privileged WebAuthn; the intermediate authenticated scope outputs match. No privileged checks were bypassed.
- Three paired, synthetic Client A `pre_v65e` SQL execution timings: QA optimization **905/749/692 ms** vs PROD-shaped baseline **1063/1025/1024 ms**. Median **749 ms** vs **1025 ms**, approximately 27% faster in this small sample. This documents why #1006 is a separate latency improvement; it does not establish a necessary functional dependency or a production load guarantee.
- All tests use synthetic QA fixtures, not customer data downloaded from PROD. No PROD write or prod source data export.

**Release implication:** keep #1006 and #1017 as separately guarded DB changes, with independent approvals, exact hashes, parity, rollback and production backup evidence. Testing #1017 only with QA's already-optimized #1006 is not sufficient by itself; the above PROD-shaped tests cover their functional compatibility, not real PROD traffic or p99.

## Security and rollback

- The SQL replaces **only** `public.iberfit_bootstrap_v26_rc29()`, guarded by its current exact definition MD5, security-definer owner, volatility, empty search path and existing EXECUTE restrictions.
- The rollback accepts only the known optimized function body MD5, restores the exact previous implementation and verifies the baseline definition and ACL after restoring.
- No increase to `statement_timeout`; no changes to WebAuthn or RLS. IRI initial diagnosis and longitudinal progress remain separate.
- Production Data Safety Gate on this PR reported **`PROD_BACKUP_COMPLETED_BACKUP_MISSING`** and **`M44_OFFSITE_RUN_TOO_OLD`**. No production DDL may proceed until those independent backup/recovery requirements are satisfied.

## Required certification before release

1. **Completed in QA:** guarded migration `20261017220957`; public rc29 body MD5 `722040e7807a52a70339277014026833`, owner postgres, `STABLE SECURITY DEFINER`, empty search path, unchanged `postgres/service_role` EXECUTE ACL. Full public API output again matched the private candidate for both Clients.
2. **Completed for observed QA matrix:** authenticated Client/Coach browsers passed 4/4; continue independent repeated-load p95/p99 certification and detect regressions after merging exact commit.
3. Verify WebAuthn privileged rejection/acceptance through the authorized device flow, lifecycle/M45 task parity, stale-session transitions and retries.
4. Run CI, Fast Lane, Production Data Safety and independent regression tests on the exact commit. Reconcile production backup and M44 offsite freshness without bypassing controls.
5. Only then merge protected Canary, verify deployed SHA live, and consider a separate incremental production promotion with explicit rollback.

**Status: guarded QA-only fix validated in a complete 4/4 device matrix and limited 16/16 authenticated SQL runs; long-tail load acceptance, exact merge-commit certification and production backup/offsite freshness remain outstanding. No Canary merge or PROD DDL.**
