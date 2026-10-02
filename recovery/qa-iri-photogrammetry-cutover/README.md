# QA-only IRI cutover experiments · 2026-10-02

During certification of PR #672, two short-lived cutover scripts were applied to **QA only**
before the production data-safety gate rejected `DROP TRIGGER` inside canonical migrations.

QA ledger entries retained for audit:
- `20261002110820 iri_physical_consent_cutover_compat`
- `20261002110851 iri_physical_consent_enforcement`

These two files are retired from `supabase/migrations` before merge and are **not production
migrations**. Their exact applied SQL is preserved below so the QA ledger remains explainable.

## Applied QA compatibility SQL

```sql
-- IBERFIT IRI v4 · expand/contract cutover compatibility
-- Apply with the schema/RPC migrations before the new frontend is promoted.
-- This keeps the previous frontend able to confirm an IRI during the deployment rollback window.
-- The new frontend still records physical consent before IRI confirmation at application level.
-- Server-side enforcement is activated by the following migration only after the new frontend is certified.

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;
```

## Applied QA enforcement SQL

```sql
-- IBERFIT IRI v4 · contract phase
-- Apply only after the new IRI frontend is live/certified.
-- Recreates the server-side fail-closed physical-consent guard.

drop trigger if exists iri_require_physical_consent_v1 on public.iri_assessments;

create trigger iri_require_physical_consent_v1
before update of status on public.iri_assessments
for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1();
```

Canonical production cutover:
1. apply the backward-compatible photogrammetry foundation migrations (new tables/RPCs/private Storage only; no restrictive change to `iri_assessments`);
2. verify the current production frontend still behaves normally;
3. promote the new frontend and certify LIVE;
4. apply `20261002113000_iri_physical_consent_enforcement.sql` as the post-deploy contract phase (baseline-only constraints, unique initial IRI and physical-consent trigger);
5. re-certify IRI confirmation and role/privacy boundaries.

`backend/IRI_PHOTOGRAMMETRY_V1_CUTOVER_COMPAT.sql` is retained only for emergency rollback/intermediate-environment compatibility. It is not part of the canonical forward PROD path.

No experiment was applied to PROD.
