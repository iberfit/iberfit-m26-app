# IBERFIT M26 · Final Production Runbook

Status: **safety preparation only**. This document does not authorize or perform a production mutation.

## Pinned release

- Release SHA: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`
- Canary branch: `canary/rc74-4`
- Promotion branch: `prep/final-production-rc74-4`
- Production Supabase project ref: `pjhmrhejsoofmouedavw`
- Production SQL bundle workflow run: `33656032685`
- SQL artifact: `final-production-promotion-sql`
- SQL SHA-256: `30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db`
- SQL artifact ZIP digest: `sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2`

Any change to a pinned value invalidates this runbook until recertified.

## Non-negotiable release gates

Do not mutate production unless all of these are true at the moment of promotion:

1. `canary/rc74-4` and `prep/final-production-rc74-4` still resolve to the pinned release SHA.
2. Exact Canary has been deployed and the full authenticated remote gate has completed successfully at that same SHA.
3. CI, Final Production Bundle, and Final Production Frontend validation are green at the pinned SHA.
4. No suspected cross-client disclosure or unresolved P0/P1 security issue exists.
5. A recoverable production database rollback checkpoint has been verified immediately before SQL apply. Record the provider backup/PITR checkpoint and its timestamp; do not export client data into the repository or release evidence.
6. The current production frontend deployment identifier and the current production Edge Function version/deployment are recorded so each can be restored independently.
7. There are no active session executions or execution locks; the SQL preflight also enforces this fail-closed.

If any gate is unknown, stale, or fails, stop. Do not partially promote around it.

## Stage A · SQL read-only preflight

Executor: `scripts/final_production_sql_execute.ps1`.

The executor is intentionally inert by default. It requires PostgreSQL connection data only through environment variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE=require`) plus `IBERFIT_PROD_PROJECT_REF`. Credentials must never be written into the command, repository, logs, screenshots, or chat.

Run the executor **without** `-Apply`. It verifies:

- current Canary and promotion refs are still the pinned SHA;
- the pinned successful Actions run and exact artifact digest;
- exact SQL SHA-256;
- expected production/forbidden QA markers;
- exact read-only preflight blob;
- expected production project ref in both the explicit target declaration and the PostgreSQL host/user fingerprint;
- production baseline via `psql` with `default_transaction_read_only=on`, `--single-transaction`, and `ON_ERROR_STOP=1`.

Expected end state: `PASS · READ-ONLY PREFLIGHT` and `ProductionMutations=0`.

## Stage B · SQL atomic apply

Only after Stage A and a verified rollback checkpoint, invoke the same executor with both mutation signals:

- `-Apply`
- exact confirmation: `APPLY IBERFIT PRODUCTION 9cbe3ad29dfda0a552aa54c7e1404575b96786d4`

Immediately before the mutating command the executor rechecks both release refs and the SQL hash. The SQL is then executed with `psql --single-transaction --set=ON_ERROR_STOP=1`. The generated SQL contains its own fail-closed production preflight and postcheck inside that transaction. A SQL error must abort the transaction rather than leave a known partial SQL promotion.

A successful SQL apply is **not** a complete application launch. The executor explicitly reports `EdgeFunctionDeployed=false` and `FrontendDeployed=false`.

### SQL rollback rule

- Failure before commit: rely on the single database transaction rollback; do not rerun blindly. Capture the failing section and diagnose first.
- Successful commit followed by a release-blocking defect: use the verified provider recovery checkpoint or a separately reviewed forward-revert procedure. Do not improvise destructive reverse SQL against live data.

## Stage C · Production WebAuthn Edge Function

The exact source is `backend/production/edge-functions/iberfit-webauthn-v1/index.ts` at the pinned release SHA. Its production contract is validated by the final-production tests, including exact origins `https://app.iberfit.cl` and `https://coach.iberfit.cl`, RP ID `iberfit.cl`, origin binding, required user verification, and JWT verification.

Before deploying it, independently verify the live production project target and current function deployment/version. Deployment must be pinned to the production project ref and must not reuse Canary/QA environment values. This stage is a production mutation and is deliberately not performed by the SQL executor.

Rollback: restore the recorded prior function deployment/version if the post-deploy WebAuthn smoke fails.

## Stage D · Production frontend

`IBERFIT Final Production Frontend` validates the production surface but does not deploy it. Before any frontend mutation:

- re-read the actual Cloudflare production project configuration;
- record the currently live production deployment identifier;
- build from the pinned release SHA only;
- generate runtime configuration with production ref `pjhmrhejsoofmouedavw`, `qaOnly=false`, and no service-role material;
- validate headers, version metadata, production origins, and absence of the QA ref/Canary hostname;
- deploy only to the confirmed production Pages project.

Do not infer the production Cloudflare project from a repository name. Recover it from live/provider evidence first.

Rollback: restore the recorded prior Cloudflare production deployment if live validation fails.

## Stage E · Post-launch verification

After all three production stages, verify in this order:

1. version/source SHA and runtime target on the live app;
2. anonymous access remains appropriately denied/limited;
3. Client A cannot access Client B data;
4. Coach/Admin privileged bootstrap fails closed before WebAuthn and succeeds only after verified assurance;
5. canonical client creation works while the legacy create surface remains revoked;
6. command registry remains exactly 52 enabled commands and critical conflict/lock rules are active;
7. no cross-client data, private Coach notes, secrets, or service-role credentials appear in browser/offline storage;
8. frontend, Edge Function, and database all correspond to the same release checkpoint.

Any cross-client disclosure or security regression blocks release immediately and triggers rollback/containment.

## Evidence policy

Store only non-secret release metadata: SHA, workflow/run IDs, artifact/checksum identifiers, provider deployment IDs, timestamps, test conclusions, and redacted errors. Never store passwords, JWTs, service-role keys, private notes, client exports, or production snapshots in GitHub evidence.
