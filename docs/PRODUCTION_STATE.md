# IBERFIT · Production State

Última actualización documental: 2026-10-02
Estado: fuente de verdad operativa para LIVE, Canary y Auth.

## WIP activo de evolución · 2026-10-02

- WIP=1: PR #678 · Personas + IRI real en terreno + Solo IRI.
- Rama: `feat/iri-field-service-lifecycle-v1`; base Canary comprobada `841e0fb65bbe2667d134d040f3ac9bdd48fef281`.
- El checkpoint remoto previo a esta corrección es `407aee869e84c91775a06bccb23980c5972cda82`. La evidencia final debe corresponder al HEAD nuevo, no reutilizar CI anterior.
- IMPLEMENTADO: `iri_only` en lifecycle canónico; alta Admin sin frecuencia de entrenamiento obligatoria; filtro Personas; conversión de la misma persona a activa; asignación Coach conservada. Bootstrap proyecta sólo el status de clientes ya autorizados; no añade una colección global. Capacidad, cartera activa y alertas de entrenamiento excluyen Solo IRI, incluidas renovaciones antiguas.
- IMPLEMENTADO: variantes en colchoneta, empuje con rodillas y duración, TRX con geometría y duración, sentadilla libre 60 s separada de silla/1MSTS, cinta submáxima 3 min con FC final/+1/+2, HRR descriptiva, carga, método y recuperación. Presets sólo de preparación; no inventan resultados ni validez. Cambios medidos de configuración invalidan comparabilidad aunque no se edite el texto libre. Informe baseline independiente.
- QA DB: migración canónica aplicada sólo a `gjztkdwfmunnzhtvxrsu`; `qa/iri-only-lifecycle-transaction.sql` certificó alta/replay, Coach, proyección scoped, un único IRI inicial intacto tras conversión, métrica activa +1 sólo al activar, rechazo de correo real y origen ajeno QA, y ACL privada. Fixtures/roles/assurance se revierten con ROLLBACK. Es certificación de rol DB, no login HTTP.
- QA mantiene la tabla experimental de servicio de drafts anteriores sin uso; no se crea ni se usa en PROD. La fuente de verdad comercial es lifecycle, no un booleano ni una segunda tabla.
- TESTS: suite oficial sin red 3.099 tests, 3.098 PASS, 1 SKIP, 0 FAIL antes del cierre documental; regresiones específicas de protocolos, métricas y gate aditivo. Repetir sólo si hay cambios funcionales posteriores.
- Navegador local: descarga de Chromium falló; las nuevas specs de filtros/conversión, wizard Solo IRI y preparación de terreno se ejecutarán en Admin Interaction Matrix del HEAD nuevo (Chromium/WebKit/Firefox y dispositivos). No marcarlas verificadas hasta ese gate.
- CANARY: pendiente de integración y certificación para #678.
- PROD: sin mutaciones por #678. LIVE del WIP: NO verificado.
- Siguiente acción: actualizar #678 y exigir todos los gates del HEAD exacto; corregir cualquier fallo; ready/merge → Canary exact deploy + autenticación/QA → preflight y migración PROD backward-compatible → promoción canónica → verificación LIVE end-to-end.

Regla: distinguir implementación, test, Canary, PROD y LIVE; no cerrar con sólo CI o pantalla de acceso.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`; PRODUCCIÓN REAL.
- Source SHA LIVE verificado independientemente en `/m26/version.json`: `841e0fb65bbe2667d134d040f3ac9bdd48fef281`.
- Runtime: PRODUCTION, proyecto `pjhmrhejsoofmouedavw`, QA desactivado.
- Release branch: `release/prod-841e0fb65bbe`; manifest commit `9541bbe4c4373700c9912da1722d766fbe0ceb7b`.
- Promotion run: [37027187997 = SUCCESS](https://github.com/iberfit/iberfit-m26-app/actions/runs/37027187997).
- PRs #674/#675: IRI v2 cerrado y publicado según checkpoint; identidad de release comprobada en esta ronda. No confundir esto con certificación LIVE del nuevo WIP #678.
- Rollback de frontend de #678: este source exacto de IRI v2. No deshacer datos lifecycle ni consentimientos para un rollback de frontend.

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

Rama `canary/rc74-4`, HEAD comprobado `841e0fb65bbe2667d134d040f3ac9bdd48fef281`; #678 todavía no integrado.

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
