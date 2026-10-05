# Security & Data Access 360 — 2026-10-05

## Alcance

Auditoría y hardening posterior a Motor Coach 360 sobre el SHA Canary certificado
`cf3e04ab67dba147b8e0d9cf2536c3fe3fe14141`.

Objetivo: reducir superficie y deriva QA↔PROD sin perder capacidades de Cliente, Coach o Admin.

## Hallazgos descartados como exposición directa

- Todos los `SECURITY DEFINER` públicos auditados tienen `search_path` fijado.
- No hay `EXECUTE` efectivo vía `PUBLIC` en los RPC auditados.
- Solo dos RPC admiten `anon`: catálogo público de ejercicios y manifest multimedia.
- Estado real PROD: no hay media publicada visible solo para Coach; los 135 assets publicados son visibles también a Cliente.
- No hay views/materialized views públicas que puedan eludir RLS.
- Tablas con RLS y sin policy no tienen privilegios directos `anon`/`authenticated`.
- Buckets IRI, fotogrametría, bioimpedancia, informes y documentos son privados.
- Edge Functions con `verify_jwt=false` revisadas usan autenticación propia explícita (Supabase user JWT u OIDC GitHub según función).

## Hallazgos corregidos en este WIP

### 1. Web Push con CORS cruzado entre entornos

Antes, QA y PROD aceptaban simultáneamente Canary, app y coach.

Corrección:
- QA: solo `https://m26-canary.iberfit.cl`.
- PROD: solo `https://app.iberfit.cl` y `https://coach.iberfit.cl`.
- Project ref desconocido: conjunto vacío, fail-closed.

JWT, autorización de recibos, VAPID y colas no cambian.

### 2. Interceptor legacy de alta de cliente

El bundle importaba `client-onboarding.js`, que instalaba un wrapper global de `fetch` y desviaba
`iberfit_create_client_draft_v12` hacia `iberfit-client-onboarding-v1`.

Problema:
- QA no tiene esa Edge Function desplegada.
- PROD sí la mantiene, pero usa RPC legacy de invitación cuyo `EXECUTE authenticated` ya fue revocado.
- El resultado podía ser una ruta distinta a la arquitectura canónica y difícil de certificar.

Corrección:
- Se elimina la interceptación global.
- Coach/Admin crean expediente mediante el RPC canónico protegido.
- `inviteClient:false` y `accessEnabled:false`.
- La identidad/acceso se gestiona por separado en Administración mediante `iberfit-admin-client-invite-v1`.
- La Edge legacy queda en fuente como stub 410 para impedir redeploy accidental de la lógica retirada.
- La UI ya no promete una invitación desde el alta compartida.

### 3. Preflight QA incoherente con la mutación QA

La mutación V12 ya admite exclusivamente fixtures sintéticos `@example.invalid` desde Canary, pero el preflight solo podía declarar `ready=true` en PROD.

Corrección:
- QA solo queda ready si:
  - el contrato backend requerido existe;
  - `environment=QA`;
  - `real_data_allowed=false`;
  - `production_blocked=true`;
  - origen exacto `https://m26-canary.iberfit.cl`.
- La mutación conserva su propia barrera adicional de correo `.invalid`.
- PROD conserva su evaluación previa.

### 4. Catálogo Admin con CORS amplio

La fuente aceptaba app, coach y cualquier `*.iberfit-cl.workers.dev`, además de responder `*` sin Origin.

Corrección:
- QA: Canary exacto.
- PROD: app + coach.
- Sin previews `workers.dev`.
- Sin comodín `*`.
- Entorno desconocido/origen ausente: fail-closed.
- Auth Admin y RPC transaccional de rename permanecen intactos.

## Estado live y rollout

En este PR no se modifica PROD.

Tras CI verde e integración en Canary:
1. aplicar en QA la migración de preflight;
2. desplegar en QA las Edge Functions endurecidas necesarias;
3. certificar alta sintética, biblioteca Admin, Web Push y matrices móviles/escritorio;
4. realizar Canary Exact Deploy del SHA integrado;
5. solo después preparar promoción controlada a PROD.

La Edge legacy `iberfit-client-onboarding-v1` sigue activa en PROD hasta una promoción explícita. No debe darse por retirada live hasta verificar el despliegue o eliminación correspondiente.
