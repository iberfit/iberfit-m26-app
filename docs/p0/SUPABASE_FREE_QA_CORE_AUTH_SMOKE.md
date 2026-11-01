# P0 Supabase Free QA · auth-only core smoke (candidate)
Status: isolated branch, opt-in OFF, no rollout. The existing Coach U39 full reconstruction remains the default.
The switch requires **all** of Canary QA host, exact QA project, exact synthetic Coach email, login reason, runtimeConfig.freeQaCoachCoreAuthSmoke=true AND ephemeral browser globalThis.__IBERFIT_QA_AUTH_ONLY_CORE_PROBE__=true. It is intended ONLY for a dedicated authentication-only test, never progress, sessions, audit, or functional E2E. The QA core RPC continues to enforce authenticated Coach identity, client scope and WebAuthn server-side. All post-ACK reasons use the complete original U39 history path.
Before enabling, require a named non-history test, authenticated QA LIVE evidence, full-history parity E2E, same SHA green security/CI/Device/WebAuthn gates, no performance SLA relaxation, and per-run matched wire bytes. Do not merge until authorized gate review. No changes to SQL, tables, RLS, JWT, Auth, PROD, data or plan.
The expected reduction is N privileged history pages avoided ONLY on a qualifying auth-only smoke login. No actual reduction in organizational billable Egress is claimed while feature remains OFF. Monitor https://supabase.com/dashboard/org/covbigthfuplzntsobua/usage; distinct Free quotas 5GB uncached/5GB cached. Rollback: leave the feature disabled.
Tracked in https://github.com/iberfit/iberfit-m26-app/issues/1209.


## Selected existing QA test / verified code path
- Coach recurring `qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs`: initial registration login checks real WebAuthn and logout, but **does not inspect historical planning/sessions**. First login sets an ephemeral global in memory only; it is cleared before the logout.
- Second genuine WebAuthn authentication must execute the unchanged complete U39 history loader. The E2E asserts first-login U38 request count = 0 and second > 0, then checks all five responsive devices and both complete historical planning archives.
- `qa/rc64/build-authenticated-surface.mjs` emits the opt-in `freeQaCoachCoreAuthSmoke: true` **only** with `M26_QA_COACH_CORE_AUTH_SMOKE='true'`, set only in the Coach recurring workflow build. Other workflows continue default-OFF. No new secrets or bypass.
- This does NOT waive the existing U39/Coach tests, change the SQL RPC, or omit any history from functional E2E. Fail/rollback if the first shell cannot render, the U37 probe requires full store data or the second login does not load history.
- No certified network reduction until a same-SHA live Coach browser run establishes first 0 U38, second >0 and validates all existing assertions; no GB claim before Supabase Usage.
