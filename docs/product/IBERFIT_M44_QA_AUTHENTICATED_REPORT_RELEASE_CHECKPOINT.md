# IBERFIT M44 — QA autenticada y certificación visual
Fecha: 15/10/2026 · WIP; ningún informe M44 nuevo en PROD.

## Pruebas SQL autenticadas ya completadas sobre QA
Todas ejecutadas con las cinco migraciones M44 en una misma transacción seguida de ROLLBACK. Se tomaron actor Admin y Cliente legítimos existentes en QA únicamente como contexto JWT simulado dentro de la transacción; todo contenido nuevo fue sintético.
- Admin autorizado: create private draft revision 1; canary client active and canonical confirmed execution with completedAt in session_executions.summary.
- Idempotency: same request returned already-created without duplicate; actor-scoped domain event recorded.
- Canonical command INFORME_APROBAR: status aprobado revision 2. Subsequent INFORME_PUBLICAR with previewAccepted: status publicado and public.reports redacted projection.
- Client bootstrap positive: published report visible exactly once, conclusions and next steps present; no private Coach note. Client bootstrap negative: private draft ID/body not exposed.
- Canonical INFORME_RETIRAR with reason: no withdrawn report visible in subsequent client bootstrap.
- QA TRUNCATE privileges for anon and authenticated were revoked and independently verified at 0 / 0 exposed tables.
All SQL was rolled back except the intentional QA least-privilege TRUNCATE grant revocation (already reflected as a migration WIP and implemented in PROD).

## CI integration
The M44 branch workflow runs npm run test:m44:contract and npm run quality:m44:report:a4 using Chromium in desktop, tablet and mobile viewports with synthetic data. Check actual Actions conclusion for the current SHA: this document does not claim CI passed.

## Still required before merging and PROD
- CI green at exact SHA; full regression, PWA and contextual #941 acceptance.
- Real QA token E2E, two-tab concurrency, foreign-client access and server-issued artifact.
- Issued immutable PDF with SHA-256, access-controlled storage, versioning, withdrawal and permissions. Current browser PDF preview is not an issued stored artifact.
- Migration release, canary smoke, responsive QA and PROD promotion only when gates are complete.
