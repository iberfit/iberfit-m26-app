# IBERFIT · Production State

Última actualización documental: 2026-09-02
Estado: checkpoint verificable. Releer rama/SHA/gates antes de cualquier mutación.

## Repositorio

- Canónico técnico: `iberfit/iberfit-m26-app`
- Visibilidad observada: public
- Rama por defecto observada: `prepublicacion/rc29`
- Nota: el README histórico afirma que el repositorio debería ser privado, pero la configuración observada es pública. No cambiar visibilidad automáticamente; resolver como decisión explícita.

## Canary — estado verificado

- Rama: `canary/rc74-4`
- HEAD: `713a65a699c3bba277ef4bac1a16c634076da6db`
- Commit: `test: alinear gate RC64.2B1 con smoke WebAuthn vigente`
- Fecha: 2026-09-02 13:18:14Z
- CI sobre ese HEAD: verde.

### Cloudflare Canary

Proyecto: `iberfit-m26-canary`
Dominio: `m26-canary.iberfit.cl`

Direct Upload exacto verificado:

- sourceSha: `713a65a699c3bba277ef4bac1a16c634076da6db`;
- sourceBranch: `canary/rc74-4`;
- `qaOnly=true`;
- Supabase QA: `gjztkdwfmunnzhtvxrsu`;
- productionRef ausente;
- deployment Pages observado: `d7dfc9f8.iberfit-m26-canary.pages.dev`.

El antiguo bloqueo `PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH` queda **resuelto para `713a65a...`**. El gate posterior valida correctamente el Canary desplegado en navegador real.

`Automatic deployments` permanece pausado intencionalmente. No reanudar todavía.

## Gate remoto posterior al deploy exacto

Run: `33636586895`.

PASS:

- gate autenticado sin mutaciones;
- evidencia remota;
- preparación Playwright;
- validación Canary desplegado en navegador real;
- candidatos visuales y evidencia.

FAIL:

- smoke autenticado RC64.2B sobre la fuente actual.

La causa ya no es Cloudflare. La investigación encontró una discrepancia de contrato WebAuthn privilegiado:

- backend QA bloquea correctamente el bootstrap Coach pre-WebAuthn con `IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED`;
- el frontend de `713a65a...` trataba assurance WebAuthn no verificado como `ready` y comenzaba bootstrap privilegiado;
- el smoke nuevo también esperaba erróneamente que el shell Coach apareciera antes de WebAuthn.

## Fix activo — PR #41

Rama: `fix/rc74-4-coach-webauthn-contract`
Base exacta: `713a65a699c3bba277ef4bac1a16c634076da6db`
HEAD verificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`

Cambios:

- restaura `privilegedMfaDecision()` fail-closed;
- sin assurance: enrolamiento o challenge WebAuthn antes del bootstrap Coach/Admin privilegiado;
- assurance verificado: `ready`;
- Cliente sin MFA privilegiado continúa normalmente;
- smoke Playwright espera gate Coach pre-bootstrap y shell Cliente;
- no automatiza WebAuthn;
- no modifica backend/RLS/Supabase/Cloudflare.

Verificación actual del PR #41:

- diff funcional del commit `9cbe3ad...`: únicamente `src/m26/app/application.js` en `privilegedMfaDecision()` (más EOF sin salto de línea);
- CI `IBERFIT M26 CI` run #323: SUCCESS;
- validación RC74.4 Phase B: SUCCESS;
- `IBERFIT M26 Continuous App Audit` run #67: SUCCESS;
- gate remoto A/B del PR: skipped por política de rama; falta validar el candidato exacto en Canary.

PR #41 debe seguir draft y sin merge/deploy hasta completar esa validación controlada.

## Candidato / prep

- Rama: `prep/final-production-rc74-4`
- HEAD observado: `824671972406bc98febaf1049ef7963f3dd571f9`
- Es anterior a la línea Canary actual; no asumir que es el candidato más nuevo.

## PR #38 / UX e i18n

La rama `feat/rc74-4-admin-coach-ux-i18n` fue observada idéntica a `canary/rc74-4` en el checkpoint `713a65a...`; no volver a fusionarla.

Otros PRs abiertos pueden contener auth persistence, PWA, route contracts, auditoría profunda y rendimiento RLS. Comparar contra Canary y rescatar sólo cambios realmente ausentes.

## Supabase

- QA: `gjztkdwfmunnzhtvxrsu`.
- QA y PROD separados.
- Producción: NO MUTAR sin autorización explícita + preflight + rollback.
- Evidencia reciente: 52/52 comandos, aislamiento Cliente A/B correcto, WebAuthn privilegiado server-side fail-closed y 0 mutaciones.

## Producción

- App LIVE: `app.iberfit.cl`.
- No se ha autorizado promoción del PR #41 ni del Canary actual.
- `iberfit-m26-production` no debe tocarse durante este cierre de QA.

## Auditoría continua

Workflow: `.github/workflows/continuous-app-audit.yml`.

Cobertura observada:

- regresión Node;
- contratos Cliente/Coach/Admin;
- auditoría integral read-only;
- evidencia retenida.

## WEBSITE — carril separado

`iberfit.cl` LIVE no coincide con `iberfit/iberfitweb@main` al 2026-09-02. No desplegar la web desde ese `main` hasta recuperar la fuente exacta del LIVE. Ver `docs/website/WEBSITE_STATE.md`.

## Bloqueos actuales

### P0

No declarar P0=0 hasta recertificar release. Cross-tenant, bypass auth/WebAuthn/RLS, corrupción/pérdida de datos o mutación accidental de PROD son bloqueantes inmediatos.

### P1

1. Validar el PR #41 exacto en Canary con el gate autenticado completo.
2. Tras esa validación, decidir integración a `canary/rc74-4` sin tocar producción.
3. Consolidar PRs antiguos/divergentes sin reintroducir cambios obsoletos.
4. Resolver deuda de README/versionado histórico.
5. Resolver explícitamente la visibilidad pública del repositorio.
6. Recuperar la fuente exacta de `iberfit.cl` LIVE.

## Condición de GO futura

No promover a producción hasta que:

- SHA objetivo fijo;
- CI completo verde;
- gate remoto completo verde;
- Canary live = artefacto/SHA esperado;
- Cliente/Coach/Admin + aislamiento de rol verdes;
- auth/WebAuthn/RLS verdes;
- P0/P1 de release cerrados o excepción explícita;
- rollback demostrado;
- evidencia conservada;
- PROD sin mutaciones inesperadas.

## Siguiente acción exacta

1. Mantener `Automatic deployments paused`.
2. Validar el candidato `9cbe3ad...` del PR #41 en Canary QA mediante Direct Upload controlado, sin producción.
3. Ejecutar el gate remoto completo contra ese artefacto exacto.
4. Si todo queda verde, integrar de forma controlada a Canary y actualizar esta fuente de verdad.
