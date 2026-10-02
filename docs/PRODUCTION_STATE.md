# IBERFIT · Production State

Última actualización documental: 2026-10-02
Estado: fuente de verdad operativa para LIVE, Canary y Auth.

## WIP cerrado · Personas + IRI real en terreno + Solo IRI · 2026-10-02

- PR #678 integrado en `canary/rc74-4`; source funcional: `44f95a7905df63d5b7b69f798080e20790340abe`.
- Lifecycle canónico `iri_only`: alta de Persona para IRI sin inventar frecuencia de entrenamiento, asignación Coach preservada y conversión posterior de la misma persona a cliente activo.
- Personas/Coach/Admin separan IRI privado de cartera de entrenamiento: Solo IRI no infla clientCount, renovaciones, capacidad ni métricas de clientes activos.
- Protocolos de terreno certificados: tobillo weight-bearing lunge; movilidad posterior adaptable a colchoneta; empuje con rodillas y duración; TRX con altura/geometría/duración; sentadilla libre 60 s independiente; cinta submáxima 3 min con velocidad, inclinación, modo, FC final/+1/+2, RPE, método y recuperación. Presets preparan, nunca inventan resultados ni validez.
- QA transaccional adicional PASS con ROLLBACK: alta Solo IRI → consentimiento físico público → `IRI_COMPLETAR` por `iberfit_execute_command_v26` con revisiones canónicas → persistencia en `domain_entities_v26` e `iri_assessments` → conversión a `active` conservando la misma persona y el mismo IRI inicial completado.
- Head previo al merge `1b203971cff430c9124f7d62115ac88218398122`: 10/10 workflows PR SUCCESS. Merge SHA `44f95a7905df63d5b7b69f798080e20790340abe`: 14/14 workflows de integración SUCCESS.
- Canary Exact Deploy run `37071775508`: SUCCESS; identidad exacta, regresión, QA auth preflight y certificación desktop/móvil read-only verdes.
- PROD: migración `client_lifecycle_iri_only_v1` aplicada y registrada; constraint admite `iri_only`, `effective_at` usa `clock_timestamp()`, helper interno conserva EXECUTE sólo para `service_role`, wrappers públicos permanecen limitados a `authenticated/service_role`.
- Postcheck PROD: 0 filas `iri_only` sintéticas/residuales. No se usaron datos de salud reales para certificar el flujo.
- Promotion run `37073343426`: SUCCESS. Release branch `release/prod-44f95a7905df`, manifest commit `ea71ab30300eb6addf37dcf6af5228b9de91fa6e`.
- LIVE: `app.iberfit.cl` certificado por el workflow productivo con source `44f95a7905df63d5b7b69f798080e20790340abe`, runtime PROD, assets Auth, entrada Chromium interactiva y auditoría integral read-only.
- Deployment PROD exacto: `116ab848-6b64-4edc-b57c-7e853965a85d` (`https://116ab848.iberfit-m26-production.pages.dev`). Rollback reservado: deployment `16048aa0-d9ca-427b-9fbb-c41e9319e103`, source anterior `841e0fb65bbe2667d134d040f3ac9bdd48fef281`.
- La escritura funcional completa se certificó en QA con fixtures sintéticos y ROLLBACK; en PROD se verificó esquema/runtime/superficie sin crear personas ni resultados clínicos ficticios.

WIP #678: **CERRADO**. IRI inicial sigue siendo baseline/bienvenida; seguimiento y evolución permanecen como dominio posterior separado.

Regla: distinguir implementación, test, Canary, PROD y LIVE; no cerrar con sólo CI o pantalla de acceso.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`; PRODUCCIÓN REAL.
- Source SHA LIVE certificado: `44f95a7905df63d5b7b69f798080e20790340abe`.
- Runtime: PRODUCTION, Supabase PROD `pjhmrhejsoofmouedavw`, QA desactivado.
- Release branch: `release/prod-44f95a7905df`; manifest commit `ea71ab30300eb6addf37dcf6af5228b9de91fa6e`.
- Promotion run: `37073343426 = SUCCESS`.
- Deployment productivo exacto: `116ab848-6b64-4edc-b57c-7e853965a85d`.
- Rollback productivo reservado: deployment `16048aa0-d9ca-427b-9fbb-c41e9319e103`, source `841e0fb65bbe2667d134d040f3ac9bdd48fef281`.
- IRI/Personas/Solo IRI de #678 está publicado. El write path de salud se certificó en QA sintético con rollback; PROD se validó sin introducir fixtures ni resultados reales/ficticios.

La siguiente evidencia de Retos es histórica del release `be39ea321cd5b476066381f64e88c5ecdf78a5a7`, no el source LIVE actual.

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

## Canary actual

- Rama: `canary/rc74-4`.
- Source funcional certificado: `44f95a7905df63d5b7b69f798080e20790340abe`.
- PR #678 integrado.
- Canary Exact Deploy `37071775508`: SUCCESS con identidad exacta, QA-only runtime, regresión y browser desktop/móvil read-only.
- Los 14 workflows observados del merge SHA terminaron SUCCESS, incluidos CI, Data Safety, QA Real Write, Continuous Audit, Admin Matrix, Authenticated Client, Daily Visual, Admin/Coach WebAuthn, Device Experience, Remote Gates y deploy Canary.
- Un commit exclusivamente documental posterior puede mover HEAD sin cambiar el runtime funcional; no confundir documentación con source PROD certificado.

## Canary certificado histórico · Retos

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
