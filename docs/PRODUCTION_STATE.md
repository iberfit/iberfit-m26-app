# IBERFIT · Production State

Última actualización documental: 2026-10-02
Estado: fuente de verdad operativa para LIVE, Canary y Auth.

## WIP activo de evolución · 2026-10-02

- WIP=1: PR #672 — `feat(iri): initial diagnosis and private photogrammetry v1`.
- Rama: `feat/iri-photogrammetry-v1`.
- Base/Canary actual comprobado: `2bc5f7b01c4fac656a4c78e6235beaf0067cca0a`.
- HEAD funcional comprobado antes de esta actualización documental: `90c1f47695e34299cfc31bfc33e150a6fb673077`.
- PR: OPEN + DRAFT + mergeable.
- IMPLEMENTADO: baseline IRI inicial único; seguimiento/evolución desacoplado de `iri_assessments`; 1MSTS separado de YMCA; informe baseline-only; fotos excluidas por defecto; consentimiento físico persistido; consentimiento fotográfico independiente; workspace privado de 4 vistas; originales inmutables con SHA-256; flujo recuperable `prepare → upload → finalize`; landmarks manuales editables/validados; geometría aspect-ratio aware; UI keyboard/touch/mobile; acceso de aplicación sólo Coach/Admin.
- TESTEADO/QA: foundation/RLS/RPC/Storage certificados en QA; bucket privado presente; Cliente privado denegado y Coach asignado permitido en gate autenticado; función trigger no ejecutable directamente por `anon` ni `authenticated`; cobertura explícita añadida para contexto Admin. El CI exhaustivo del HEAD documental final sigue pendiente.
- CI previo: Fast Lane, M26 CI, Production Data Safety, QA Real Write, Continuous Audit, Authenticated Client, Admin Interaction Matrix y Daily Visual llegaron a GREEN. Device Experience reprodujo dos shutdowns dentro de la spec de fotogrametría; la causa raíz se aisló en el `MutationObserver` del controller, que podía reaccionar a su propio `render()` durante la carga inicial y encadenar nuevas cargas antes de resolver el estado remoto. `90c1f47695e34299cfc31bfc33e150a6fb673077` ignora mutaciones internas del workspace y conserva recarga ante cambios externos de ruta/contexto, con test de regresión específico. Tras ese fix el matrix recorrió las 60 pruebas: 55 pasaron y 5 touch fallaron sólo en viewports bajos porque el harness hacía `touchscreen.tap` con coordenadas absolutas después de desplazar el chip de landmark; el canvas podía quedar fuera del viewport. La spec se endurece para traer el canvas a viewport y validar las coordenadas antes del tap, manteniendo la misma exigencia de movimiento del landmark. Canary Policy sigue siendo dependiente del Device gate. No reutilizar CI anterior como evidencia del HEAD final.
- QA DB contiene historia de experimentos de cutover; el forward path de PROD sigue siendo `foundation backward-compatible → frontend LIVE → post-deploy contract`.
- PROD preflight read-only 02/10: #672 aún no está aplicado (sin tablas nuevas ni bucket); existe 1 IRI `inicial`, estado `revisión`, 1 cliente y 0 clientes duplicados. Esto justifica que el guard físico proteja `revisión/aprobado/publicado` cuando se active el contract phase.
- CANARY: NO integrado ni certificado para #672.
- PROD: NO mutado por #672.
- LIVE VERIFICADO: NO para #672.
- Siguiente acción exacta: completar CI del HEAD final; sólo con todos los gates verdes pasar PR a ready, integrar en Canary y ejecutar el cutover canónico con verificación real en cada fase.

Regla: cualquier avance de este WIP debe actualizar este bloque sólo con hechos comprobados y distinguir implementación, test, Canary, PROD y LIVE.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA LIVE verificado: `be39ea321cd5b476066381f64e88c5ecdf78a5a7`
- Release branch: `release/prod-be39ea321cd5`
- Promotion run: [`36791716608 = SUCCESS`](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791716608)
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD: `pjhmrhejsoofmouedavw`

La promoción de Retos personales canónicos (PR #631 y corrección del gate de privacidad #658) terminó a las 23:36 UTC. LIVE verificó identidad SHA, runtime PROD sin QA, entrada interactiva Chromium (3 pruebas) y auditoría integral de sólo lectura.

- Deployment exacto: `6c2e3a06-b386-431b-80f7-60e37a8307cf`.
- Rollback frontend anterior: `d6752de2-8bac-4d27-8c8c-ce3809d6bf60`, SHA `b62eb0468dc972b4555c4ae2b29c564ebabb01f7`.
- Evidencia de promoción: [artifact 11131709849](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791716608/artifacts/11131709849).
- Navegador LIVE independiente: carga finalizada, formulario de acceso visible y botón Entrar disponible. No se inició una sesión autenticada PROD en esta ronda.

### Retos: migración y alcance certificado

- SQL canónico: `20260927043000_challenge_canonical_domain_v1.sql`, incluyendo rechazo explícito de días/objetivo nulos.
- QA ledger: `20260930231510`; PROD ledger: `20260930233306`, ambos `challenge_canonical_domain_v1`.
- PROD conserva 101 tablas públicas, 0 hábitos y 0 retos; sólo se añadió el contrato de dominio, sin fixtures ni cambios de datos personales.
- Registro: RETO_CREAR / RETO_ACTUALIZAR / RETO_ARCHIVAR, sólo Admin/Coach; 3 transiciones y trigger activo; factory sin EXECUTE anon/authenticated.
- Hashes PROD de registro/transiciones excluyendo challenge, iguales antes y después: `b5c7363c3e777bff7bc2a70ae4e0622c` / `27bcc4de2d3bd0a554467336bbdd094b`.
- Recuperación previa: [Data Safety 36790257428, attempt 2](https://github.com/iberfit/iberfit-m26-app/actions/runs/36790257428), 26/26 pruebas, snapshot lógico del esquema del 30/09 23:30 UTC, SHA256 `e8504714674ea894515153a13263c4497c970995ed68f03e0e8f76771f141026`, 838897 bytes, artifact 11131463200. Es recuperación de esquema, no backup de filas.
- QA comprobó creación, persistencia, actualización, archivo e idempotencia Coach/Admin; lectura/bootstrap Cliente; aislamiento entre clientes y rechazo de escrituras directas, grupo/comunidad, valores nulos y datos de salud. Fixtures archivados con auditoría retenida.
- Las pruebas RPC de ciclo de vida usaron rol de base de datos authenticated y claims QA; no equivalen a login HTTP. Los gates HTTP/browser autenticados QA pasaron por separado.
- La excepción de privacidad sólo admite `rawHealthDataAllowed: false` booleano en body de entidad canónica challenge; los demás datos prohibidos siguen bloqueados.

No considerar releases posteriores en PROD sin otra promoción y verificación LIVE explícitas.

## Canary certificado para esta promoción

- Rama: `canary/rc74-4`
- Source certificado: `be39ea321cd5b476066381f64e88c5ecdf78a5a7`
- Merges de este lote: PR #631 y #658.
- [Canary Exact Deploy 36791028304](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791028304): SUCCESS, deployment `17fb6d68-7ee8-4aaf-9674-66ea513ae931`, identidad exacta y smoke LIVE desktop/móvil.
- [Gate remoto 36791028388](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791028388): SUCCESS, auth read-only, 7 pruebas de smoke, recuperación sin freeze y 4 pruebas visuales autenticadas.
- CI, Continuous Audit, Hosted Auth Security QA y Admin/Coach WebAuthn: SUCCESS sobre el mismo SHA. Device Experience pasó sobre `09733a94e973eb61e8f3b655422e7f2fc95b8418`; #658 sólo cambió helper del gate y sus tests, sin delta src/public/qa/supabase.
- El HEAD de trabajo puede avanzar por documentación; no confundirlo con el source LIVE certificado.
- P0 funcional demostrado: 0 en las rondas certificadas actuales.
- Branch protection: no disponible mediante el conector GitHub actual; deuda P1 aún abierta.

### Contexto histórico del baseline documentado el 17/09

- PR #471: gate autenticado permanente + fixes finales de interacción/foco.
- PR #472: refresh silencioso al volver de background/online, sin rerender.
- PR #473: logout local por defecto; revocación global explícita.
- PR #474: refresh tokens/sesiones revocados terminan login sin retry loops.
- PR #475: email OTP resend, expiry/replay/rate-limit/red con UX recuperable.
- PR #476: paridad arquitectónica QA/PROD de la Edge de invitaciones.
- PR #477: reintento Admin de invitación fallida sin recrear cliente ni duplicar identidad.

Los heads finales de estos lotes pasaron Fast Lane, CI, Continuous Audit y los gates aplicables de Admin/Device/Authenticated Client/QA Real Write.

## Supabase QA

- Proyecto: `gjztkdwfmunnzhtvxrsu`
- Estado: `ACTIVE_HEALTHY`
- `iberfit-webauthn-v1`: misma implementación canónica que PROD.
- `iberfit-admin-client-invite-v1`: v26.4, `verify_jwt=false`, validación interna de bearer con `auth.getUser()`, origen QA limitado a `m26-canary.iberfit.cl`.
- Source Edge QA = source Canary en el checkpoint.
- QA Real Write certifica:
  - token inválido bloqueado;
  - Coach bloqueado para reenvío de invitaciones;
  - direct insert/update/delete bloqueados;
  - cross-client read/command bloqueados;
  - privileged assurance requerido;
  - idempotencia/persistencia controladas.

PROD de la Edge de invitación no se ha modificado durante este bloque.

## Auth / correo transaccional PROD

PROD mantiene:

- `site_url = https://app.iberfit.cl/`
- signup público deshabilitado;
- longitud mínima de contraseña >= 8;
- anonymous y autoconfirm deshabilitados;
- secure email change habilitado;
- SMTP personalizado Resend desde `acceso@auth.iberfit.cl`;
- SPF, DKIM y DMARC verificados;
- 13 plantillas Hosted Auth IBERFIT sincronizadas;
- OTP email de 6 dígitos y recovery real certificados;
- secure password change habilitado.

La aplicación mantiene WebAuthn como opción preferente de assurance privilegiada y fallback por código de correo cuando corresponde.

## Seguridad / backend

- PROD y QA: `ACTIVE_HEALTHY`.
- WebAuthn privilegiado: fail-closed.
- Los dos SECURITY DEFINER anon revisados corresponden a lectura pública intencional de catálogo/media.
- RPC Admin críticos revisados exigen privileged assurance, Admin, organización y scope.
- Las alertas generales de RLS/SECURITY DEFINER/índices no se corrigen de forma masiva; deben resolverse por intención y consultas reales.
- Leaked-password protection continúa condicionado al plan Supabase disponible.

## Pendientes históricos del 17/09 (requieren revalidación)

### P0

Ninguno demostrado en el Canary actual.

### P1

1. Admin autenticado QA real desktop/tablet/móvil.
2. E2E positivo Admin de invitación/reenvío y alta/edición/baja controlada.
3. Sesión Coach real por dispositivo sin freezes y recuperación de error.
4. Completar auditoría SECURITY DEFINER/RLS/índices por intención.
5. Proteger Canary con required checks cuando la configuración del repositorio esté disponible.
6. Outcome tracking, preparar próxima sesión y seguimiento longitudinal.

## Contrato para una próxima promoción

Sólo cuando:

- source/candidato exactos;
- Canary certificado sobre ese SHA;
- SMTP/Auth readiness GREEN;
- Edge/DB QA relevantes en paridad con el código que se quiere promover;
- Admin/Coach autenticados reales suficientemente cubiertos;
- rollback identificable;
- smoke y auditoría post-deploy;
- ninguna mutación accidental de PROD.

La promoción debe distinguir código preparado, PR, merge, Canary certificado, release y LIVE. Ningún merge a Canary implica producción por sí mismo.
