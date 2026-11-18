## SUPABASE FREE · canonical ACK receipt fix · 17/11/2026
- Candidato PR #1367 previo `787b0e60671e583ec9f3c77cc7ce2d4ec2493ce9`, QA E2E completa SUCCESS [44207449369], U74 SUCCESS [44207435907], CI/Fast Lane/Device/WebAuthn verdes. Solo Production Data Safety NO-GO (M44 PROD restore real no ejecutado).
- Evidencia real extraída de `iberfit-m43-auth-client-browser-44207449369`: mobile 105 solicitudes/3.430.374 bytes, desktop 71/2.196.679 bytes; en total **176 solicitudes, 5.627.053 B, de las que 18 bootstraps completos 5.370.898 B**. Baseline anterior 176/5.561.909 B, 18 bootstraps/5.305.535 B: no hay ahorro demostrado. Ambos son bytes de cuerpo observados por Playwright, NO billable Supabase Egress.
- Causa precisa del piloto inefectivo: la función `public.iberfit_execute_command_v26(jsonb)` llama al contrato canónico de recibos de `iberfit_execute_command_v26_rc29(jsonb)`, que retorna `operationId` y `remoteRevision` en el nivel superior, pero **`entity_id`, `client_id`, `base_revision`, `remote_revision`, `command_type` y `actor_user_id` en `receipt` snake_case**. El guard anterior esperaba `response.entityId/clientId`, fallaba cerrado y mantenía todas las relecturas. Cambio acotado al guard del piloto QA: verificar todos los campos canónicos del recibo, revisiones y `duplicate===false`; no cambiar SQL, grants, roles, Auth, QA fixture ni PROD. Sólo Cliente sintético A, timeout 15/30s, cancelación en logout y separación de entrenamientos; pruebas negativas de recibos falsos.
- El ahorro debe verificarse en un E2E de browser sobre el SHA nuevo y comparar peticiones del mismo flujo con control de cambios de fixture; si no cae el contador bootstrap, no promocionar optimización. Mantener CI exact SHA y Production Data Safety NO-GO.

## P0 SUPABASE FREE · lectura pos-ACK de progreso QA y timeout real · 17/11/2026
- PR #1367, rama `feat/real-training-360-one-release-20261117`, candidato previo `34e5ca11c037993541d4f9e1e8f465be31a2fcd8` (seguir HEAD real, no fijar SHA como LIVE). Se ha incorporado `progressAckRefreshWindowMs` (15 s, máximo acumulado 30 s) al bus de comandos solo para Client A sintético QA y en el runtime current-source Canary, con flag explícito. Tras ACK exacto y CAS monotónico se mantiene cada escritura, se difiere solo la relectura completa; otras acciones, fallos, otras identidades u otras sesiones mantienen refresh independiente; no se usa service-role, caché de datos privados ni bypass Auth.
- Evidencia de causa real: `QA Real Write` run 44194809157 tuvo dos HTTP 500 del `iberfit_bootstrap_v26()` en navegador M43; Postgres y PostgREST registran SQLSTATE 57014 y cancelación por statement_timeout. No atribuirlo a Auth. E2E U74 entrenamiento fechado del SHA `2749bf1...` completado SUCCESS.
- Métrica anterior: M43 QA run 44187184422 observó 18 llamadas bootstrap / 5.305.535 bytes de 176 llamadas / 5.561.909 bytes de respuestas de navegador, NO facturación de Egress. Logs 24h QA 1.688 bootstraps, PROD cero en esa ventana: contadores de solicitudes, no bytes oficiales.
- Pruebas Fast Lane run 44205906155: 129/129 PASS con seis pruebas nuevas QA opt-in/default PROD/ownership/CAS. CI M26 del SHA previo en SUCCESS; continuar E2E real y medir bytes/500 antes de promover cualquier ahorro. No afirmar certificado si la nueva ejecución no termina GREEN.
- M44 PROD: ningún certificado vigente de respaldo cifrado completo restaurado con Hosted Auth, Vault, ACL y secretos; Production Data Safety Gate falla cerrado. **NO-GO PROD**, no merge ni grants ni DDL/DML productivos. Sin limpieza de datos.

## REAL TRAINING 360 · QA negative invitation and U74 exact source · 17/11/2026
- El HEAD previo `726a60ea725673be7fe2bb76240a7abb2d49fe50` tenía `12/14` workflows de PR verdes: QA Real Write falló por contrato de versión desactualizado (esperaba Edge v26.5, despliegue verificado v26.6; HTTP 401 V26_AUTH_REQUIRED era correcto); Production Data Safety continúa bloqueado por respaldo PROD M44.
- U74 sobre el mismo SHA tuvo preflight autenticado PASS y segundo intento bloqueado antes de escrituras con `U71_PREFLIGHT_MISSING_STALE_OR_CHANGED`. El código ahora incorpora `candidateId` y `candidateRevision` a la evidencia firmada, conserva la prescripción exacta entre intentos y aborta si la revisión cambia o las fechas quedan ocupadas; no cambia autenticación ni permisos.
- Se preservan la rama única PR #1367, validaciones SHA/runId/2h, QA sin service-role, RLS y rechazo de acceso cruzado. Ejecutar de nuevo certificación real exact-SHA; no afirmar recuperación PROD ni hacer merge mientras M44 no esté verificado.

## REAL TRAINING 360 · U74 browser QA en rama actual · 17/11/2026
- PR #1367 preparada para pruebas, HEAD anterior `f9141d777bc92425da75d7eaec55f2e22a199bf0`. La certificación real U74 de dos fechas apuntaba solo a una rama histórica; su trigger ahora incluye `feat/real-training-360-one-release-20261117` y las rutas exactas de U72, flujo Cliente/Coach y contratos.
- **Primer intento:** preflight autenticado de solo lectura en QA. **Segundo intento:** requiere rerun explícito del mismo job, runId, SHA, evidencias y fechas dentro de la ventana de dos horas; solo entonces permite citas sintéticas QA, dos ocurrencias, entrenamiento táctil inicio/pausa/reanudación/resultados/feedback/fin, revisión Coach, fecha futura independiente y denegación cliente ajeno. Sin service-role ni PROD.
- Se mantiene la rama histórica y el doble control; esta integración no constituye certificado mientras no termine exitosamente la prueba real. M44 PROD y despliegue backend continúan cerrados.

## REAL TRAINING 360 · QA Coach invitation finalizer CAS and Edge acceptance · 17/11/2026
- PR #1367 DRAFT, staged SHA `618be778ff60216d4570ffeff7a80d866b506ca3` (al registrar este checkpoint). QA migración `coach_invitation_finalize_cas_v2`, versión aplicada `20261117214914`: finalizer `168dc6bd262169a58a6d9ff12558078d`, prepare/bind inalteradas, `anon` denegado, `authenticated` permitido con WebAuthn y scope interno, `SECURITY DEFINER search_path=''`.
- Endurece `finalize`: valida `operationId` contra el último intento, serializa con bloqueo de fila, idempotencia terminal sin segunda auditoría y evita que una respuesta tardía sobrescriba una invitación ya confirmada. Transacción previa QA ejecutó `CREATE OR REPLACE + verificación + ROLLBACK` y confirmó restitución del hash original.
- Edge QA `iberfit-admin-client-invite-v1` versión 16, bundle `c847ac0732966de086e82a4b4a5570719a18a9159b75a141305b3e136efc0e5d`, código fuente exacto `9124e4e5c46419f4cc339fed05f6be34ac67524b`, `verify_jwt=false` histórico con `getUser()`/WebAuthn SQL. Su nueva rama pendiente conserva identidad Auth aceptada por proveedor ante error de vinculación, sin borrados automáticos. Rollback QA archivado: versión original con blob `a6ee9759dbc99267fff6cbc256d6dd906109fdea`.
- PROD intacta: Edge versión 9 bundle `4d2dff2482f791787993455c52daea17e81d6b69093ca362e3c2c07b52ee4399`; SQL Coach finalizer original `66743cf255b81523a4733b63d1c98fc0`; U72 ausente, U60 sin grants públicos. QA Real Write en DRAFT se limita al guard de PR y **NO** certifica todavía E2E de escritura real; debe ejecutarse al pasar Ready.
- M44 contrato y restauración PG17 sintética verdes; respaldo/restauración cifrada de PROD real no certificado, `PROD_BACKUP_COMPLETED_BACKUP_MISSING` y `M44_OFFSITE_RUN_TOO_OLD`. NO-GO PROD, no limpiar clientes, no enviar correos reales durante esta certificación.

## M44 · Corrige clasificación de Edge activo mientras LIVE queda archivado · 17/11/2026
- PR #1367: `iberfit-admin-client-invite-v1` sigue siendo un endpoint **ACTIVO en PROD** (bundle hash histórico `4d2dff2482f791787993455c52daea17e81d6b69093ca362e3c2c07b52ee4399`), aunque su fuente LIVE original se ha archivado para permitir un candidato nuevo. No confundirlo con el endpoint onboarding retirado.
- Mantener SHA Git de fuente LIVE `a6ee9759dbc99267fff6cbc256d6dd906109fdea` bajo `scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts` y `source_state='canonical_live_snapshot_pending_release'`. Catálogo de runtime `deployment_policy='canonical'` porque la función sigue activa. Cambio del modelo de evidencia, no del código productivo.
- Manifiesto independiente para candidato `scripts/ops/m44_edge_candidate_iberfit_admin_invite_v1.json` fija SHA fuente nuevo `9124e4e5c46419f4cc339fed05f6be34ac67524b`, identidad, origen, sin nuevos nombres de secretos, `external_live_attestation:false` y `production_release_approved:false`. Tests para hashes de ambos y anticorrupción. Sin cambio de datos/ACL/DDL.
- La evidencia M44 de fuente original no prueba que el candidato ya está en LIVE. Hosted Auth/Vault/secretos y restauración completa continúan no certificados hasta el gate productivo auténtico.

## REAL TRAINING 360 · Recuperación M44 postintegración con coste controlado · 17/11/2026
- PR #1367 sigue **DRAFT, NO-GO PROD**. El workflow existente `m44-encrypted-disaster-recovery.yml` incorpora **dos triggers exactos solo en `push` protegido a `canary/rc74-4`** para los archivos definitivos de Coach invite y U72. Si ambos se integran en la misma fusión, GitHub inicia un único run de copia cifrada de PROD DB+Storage y restauración PG17 aislada; no dispara backup productivo al modificar PR draft. Se conservan todos los jobs, accesos, cifrado AES-GCM, verificación de bytes, puertas de credenciales, retention y guards.
- **No tomar GO productivo de este trigger**: solo el workflow realmente SUCCESS con ciphertext exportado, jobs/steps y artifact vigentes en ventana <=2h permite evaluación M44. El workflow de Data Safety sigue bloqueando la release hasta tener evidencia plena; Hosted Auth/JWT/Vault recovery no se presume validado por M44. No ejecutar backups repetitivos cada commit, coste Free prioritario.
- PR #1367 mantiene los jobs Auth/RLS/E2E pendientes por DRAFT y la promoción backend bloqueada. PROD no se modifica por este cambio en código; tras la fusión protegida se disparará una nueva prueba M44 bajo secrets y control de entorno. Si el workflow falla o falta el ciphertext, parar la promoción, nunca suprimir el gate.

## SUPABASE FREE #1209 · QA M43 Owner projection, PR #1367 DRAFT · 17/11/2026
- Cambio QA-only integrado en el mismo macrobloque **REAL TRAINING 360 PR #1367 (DRAFT / NO-GO PROD)** para evitar otra PR y baterías paralelas. Parte de Canary SHA `6b6033e395c900c42f7a0ac6209838e895df4c83` con #1366 12/12 postmerge SUCCESS.
- Nuevo RPC `public.iberfit_qa_m43_owner_projection_v1(text,uuid)` exclusivamente QA; ejecuta el MISMO bootstrap original por JWT de identidad sintética Cliente A/B y devuelve solo visible canónico + legacy y metadata {entityType,entityId,clientId,status,revision} de sesión, jamás historial ni body. Guardia QA, email autenticado, client_id, allowlist, SECURITY INVOKER, anon denied, hash de bootstrap y RPC anterior, fail-closed para esquema/duplicados/propietario. Migración/rollback QA dedicados. Ninguna migración aplicable a PROD.
- Runner M43 conserva completas: (a) carga inicial A+B y presupuesto/hashes, (b) cierre de ejecución QA interrumpida, (c) carga final A verificando métricas 3 deportes, feedback, privacidad e historial, (d) todos los deny/ACL/foreign JWT y navegador multi-dispositivo. Sustituye SOLO cuatro descargas intermedias de Cliente A por su RPC de proyección; no cambia el servidor principal, la política RLS ni los datos.
- Ahorro potencial nominal hasta 4 x 1.683.564 B = 6.734.256 B JSON sin comprimir por run M43 si Client A es primario; Client B fallback es más pequeño; CPU del bootstrap **no** baja y ahorro egress facturable pendiente de Usage. #1209 permanece abierto hasta medición oficial del ciclo.
- Estado inicial: código en PR #1367 draft, sin aprobación de merge ni producción. Para certificar se necesitan tests offline/CI, migration QA guardada, readback seguridad, QA Real Write exact SHA al quitar el draft cuando también estén listas las demás funcionalidades del macrobloque. Si esa release no pasa, NO promover y revertir SQL QA de forma aislada.

## SUPABASE FREE #1209 · Candidato QA M43 bootstrap visibility · 17/11/2026
- Base exacta Canary `24df8dc8724997ee1ee691a39a3ef1586d71257a`. Nuevo P0 piloto **QA-only** que elimina cuatro transferencias del bootstrap **del cliente extranjero** en cada ejecución M43. Antes: 4 respuestas completas; después: 4 respuestas `{canonicalVisible,legacyVisible,schema}` calculadas con la **misma** función `iberfit_bootstrap_v26()` sobre el **JWT original** en PostgreSQL; se mantienen las pruebas de visibilidad canónica+legacy en los cuatro hitos. Bootstrap A y B iniciales íntegros y el bootstrap propietario en cada lectura permanecen.
- Función nueva `public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)` con **SECURITY INVOKER**, solo role `authenticated` y dos identidades QA sintéticas exactas, guard `QA`/no-real/prod-block, tipos e IDs restringidos, fail-closed ante payload incompleto; sin serializar datos privados adicionales ni alterar la función bootstrap. SQL solo en `supabase/qa-migrations/`, rollback SQL dedicado. No tocar PROD, ACL ni RLS existentes.
- **Candidato hasta evidencia:** primero migración QA guardada + readback real con Auth de ambos clientes + contrato JS; luego CI/QA Real Write M43 por HEAD exacto y, solo tras PASS, squash a Canary y postmerge. Si no existen arrays canónicos o falla el rol, la prueba falla cerrada; no omitir ni suavizar comprobaciones. El ahorro es transferencia de JSON QA, no cuantificar GB facturables sin Usage. No propagar esta RPC a producto ni a PROD.
- Usage oficial del usuario 17/11 16:49 CL: egress 1,435/5 GB, cached 0,287/5 GB, Log Query 90,711/100 GB (no facturado ni aplicado aún); prioridad no repetir escaneos amplios de Logs. #1209 OPEN.

## SUPABASE FREE P0 · M43 QA cierre del cupo sintético · 17/11/2026
- Postmerge #1364 SHA `868eb9a14d57e92580b69a9c31475b24e00c28ce`: QA Real Write #44148370844 FAIL-CLOSED por `M43_QA_SYNTHETIC_FIXTURE_BUDGET_EXHAUSTED` en su paso M43; demás cinco workflows postmerge SUCCESS, incluido Canary Exact Deploy. No fue fallo de producto ni se omitió ninguna prueba.
- Observación SQL exclusivamente QA: 754 sesiones M43 sintéticas en un actor, 168 en otro; 172 sesiones posteriores verificadas terminadas, propietario/revisión exactos, una ejecución canónica completa y una legacy cerrada confirmada con resumen, ninguna cita/bloqueo/evento entre clientes. Manifest inmutable v4 conserva 601 hashes previos y añade 172 nuevos SHA-256 del registro completo; **sin borrado ni cambio SQL**, sin subir el límite 150.
- Candidato requiere CI, pruebas negativas, M43 QA real y Canary exact SHA; no tocar PROD. Ahorro de GB facturable no certificado; #1209 OPEN. Rollback por revert.

## SUPABASE FREE P0 · legados de trigger remoto actualizados sin debilitar control · 17/11/2026
- Auditoría global del candidato detectó DOS pruebas antiguas que exigían literalmente `scripts/remote-gates/**`: `m26_fast_lane_contract.test.mjs` y `m26_p0_free_qa_remote_auth_gate_scoping.test.mjs`. No eran fallos de seguridad real ni de la función Supabase: comprobaban un patrón antiguo que precisamente generaba egress repetido.
- Ambas se actualizan para exigir las **cuatro** dependencias reales del read-only runner, el catálogo de comandos y los tests de clasificación, manteniendo prohibida cualquier ruta genérica `scripts/remote-gates/**`, `scripts/**`, `src/**`, `qa/**`, `docs/**`. El test de scoping continúa verificando la lista completa exacta y la autenticación predeploy incondicional de Canary. El workflow remoto incluye ahora ambos contratos legados como paths que deberán volver a comprobarse ante futuras modificaciones.
- No se ignora ninguna prueba ni se silencia un failure; después de estos ajustes se exige de nuevo CI/auditoría completa y QA real de HEAD exacto. Rollback por revert, PROD inalterado.

## SUPABASE FREE P0 · clasificación de disparadores QA sin pruebas redundantes · 17/11/2026
- **Baseline real:** Canary `dd245f04a286c4e10a7507add07f5f167563dbf3`, PR #1362 fusionada y postmerge **8/8 SUCCESS**, incluido Canary Exact Deploy, Auth alojado, Remote Readonly y QA Real Write. Organización Supabase Free; PROD sin cambios. Tracking #1209 abierto.
- **Causa confirmada:** `.github/workflows/remote-gates.yml` usa `scripts/remote-gates/**` en `push` Canary, lo que lanza la costosa batería autenticada multibrowser de solo lectura incluso cuando únicamente cambian scripts de la batería de **escritura real** que ya tiene el workflow `qa-real-write-cert.yml`. Ejemplo: los cambios de solo identidad QA de #1362 dispararon ambos postmerge. Esto duplica autenticaciones y bootstrap sin certificar código afectado por el otro dominio.
- **Corrección de causa raíz:** sustituir ese comodín remoto por las **cuatro** dependencias de lectura utilizadas realmente por `run_authenticated_readonly_gate.mjs`: el runner, `readonly-network-policy.mjs`, `readonly-gate-client-isolation.mjs`, `readonly-gate-bootstrap-privacy.mjs`. Añadir `src/m26/command-catalog.js` (importación de ese runner que antes quedaba fuera). Se mantienen triggers de aplicación, UI, Auth, RLS, migraciones QA, WebAuthn, comunicación, Playwright, runtime y workflow para que **cualquier cambio relevante** siga recertificando la lectura.
- **Contrapartida de seguridad:** el workflow `qa-real-write-cert.yml` declara ahora también como triggers de PR/push sus dependencias reales `m43-qa-fixture-safety.mjs`, `m43-qa-retained-history-v3.json`, `m43-writer-handoff.mjs`, `src/m26/profile/client-avatar.js`, `src/m26/exercises/catalog.js` y `src/m26/production-state.js`. Se elimina una brecha anterior: antes algunos cambios en las dependencias de escritura M43 no lanzaban su certificación.
- **Contrato de regresión nuevo:** `tests/m26_p0_free_qa_trigger_routing_contract.test.mjs` resuelve importaciones locales del runner read-only y writers reales; asegura trigger correcto, equivalencia PR/push de escritura, ausencia de un wildcard de más y conservación de Canary Exact Auth Preflight **en cada push**. La prueba también se registra en los triggers pertinentes.
- **Alcance/rollback:** solo dos YAML CI + test + documentación, cero SQL, cero cambios de RLS/frontend/PROD, sin datos borrados. Rollback por revert de commit. No se han recortado pruebas de Auth/Coach/Cliente: se evita ejecutar **una batería no relacionada** cuando únicamente cambia el otro tipo de test. Ahorro de peticiones por futuras PR QA-only; no cuantificar GB de Supabase sin medir en Usage. Este propio cambio de workflow ejecutará nuevamente la batería remota y la de escritura, como prueba de transición.
- **Promoción estricta:** 1 PR -> Fast Lane + CI + Policy + Auditoría + QA Real Write si se dispara; squash a Canary solo con resultados exactos verdes; postmerge y Canary Exact SHA completos. PROD sin tocar; #1209 OPEN.

## SUPABASE FREE QA · garantía de reloj JWT para lectura mínima · 17/11/2026
- Al sustituir el bootstrap por `iberfit_client_id` en la prueba M42, se amplió la allowlist de recuperación acotada de JWT emitido en el futuro: ahora incluye `iberfit_client_id`, siempre solo en errores **exactos** de iat futuro. Mantiene token original, 350/800/1300ms de reintentos acotados, sin reintento para tokens expirados, 403 o endpoints mutantes. Contrato `m26_qa_m42_readonly_future_iat_retry.test.mjs` ampliado. El workflow QA certifica el helper y sus tests en PR/push.

## SUPABASE FREE 360 · P0 ahorro real de JSON en pruebas de QA · 17/11/2026
- Base protegida: PR #1361 fusionada por squash a Canary SHA `967261298e2c9df444d5939385b336d9a978f145`, 9/9 controles premerge. El deploy Canary Exact resultó SUCCESS; confirmar 11/11 postmerge antes de una PR nueva.
- **Causa observada:** `run_qa_real_write_gate.mjs` y `run_qa_m42_avatar_private_gate.mjs` consultaban por cada ejecución el RPC pesado `iberfit_bootstrap_v26()` para Cliente A y Cliente B **exclusivamente para extraer rol/UUID**, no para validar su historial. En QA, respuesta JSON sin compresión medida por SQL `octet_length(...::text)`: Cliente A `1.683.564 B`, Cliente B `610.696 B`. Dos probes × dos clientes = **4.588.520 B de JSON completo por ciclo** que puede evitarse, antes de compresión HTTP y cabeceras. No confundir con GB facturados.
- **Solución:** sustituir solo esas 4 lecturas por los RPC existentes `iberfit_current_role_v26` y `iberfit_client_id` (respuestas JSON 9B + 38B por Cliente QA). Conservan el JWT individual, autorización del backend, comprobación de rol/UUID, QA-only, `iberfit_environment` y RLS/Storage real. 4 llamadas grandes sustituidas por 8 llamadas mínimas (más solicitudes HTTP, menos transferencia); probar condiciones de red, no sobreestimar ahorro financiero.
- **Sin pérdida de pruebas:** `scripts/remote-gates/run_authenticated_readonly_gate.mjs` mantiene acceso real a `iberfit_bootstrap_v26`, incluidos privacidad y control de WebAuthn; `scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs` **sigue leyendo el bootstrap canónico íntegro** para comprobar reservas, historial, estados y persistencia; no se toca la lógica de Cliente/Coach ni el histórico. Se añade helper QA sin caché para leer ambas funciones bajo el mismo actor y test de invariantes, con las dos entradas de rutas en los triggers `qa-real-write-cert.yml`, tanto PR como push.
- Sin migraciones, privilegios, acceso entre clientes, secretos o datos afectados. Rollback: revertir archivos de esta PR. No PROD. El issue #1209 permanece abierto hasta medición de egress en panel oficial y proyección mensual; no se garantiza Free perpetuo.

## SUPABASE FREE · P0 IRI emisión: control por rol y asignaciones en conjunto · 17/11/2026 (QA)
- **Base:** Canary `855be2d6d72a3330ef50419f036ede2e8f3232de`, PR #1360 ya fusionada, Canary Exact Deploy y **11/11 workflows postmerge SUCCESS**. Producción mantiene sus funciones/políticas originales y no se modifica.
- **Hallazgo CPU:** `public.iri_report_issuances_v1` (QA 2245 informes) ejecutaba `iberfit_can_manage_iri_private_v1(client_id)` por fila; el Coach registró en muestras EXPLAIN previas hasta ~1509ms / ~22648 bloques cacheados. Se detectó que el rol no cambia entre filas y las asignaciones activas pueden consultarse como un conjunto.
- **Piloto aplicado exclusivamente en QA:** migración `20261117154233_p0_free_qa_iri_issuance_set_based_initplan_v1`, cambia únicamente la expresión SELECT de `iri_report_issuance_read_manager_v1` a 1) rol admin calculado con InitPlan; 2) coach con `client_id IN (SELECT client_id ... client_assignments WHERE coach_user_id=auth.uid() AND active)`; 3) conserva **sin cambios** la llamada `iberfit_can_manage_iri_private_v1(client_id)` como respaldo para casos históricos/legacy. Política authenticated, RLS enabled, mismo número de políticas y GRANT. Guards sobre funciones fuente, rol, política de asignación, versión y entorno QA.
- **Equivalencia:** bajo `BEGIN … ROLLBACK` se compararon recuentos y hash exacto de IDs visibles de QA Cliente A, Cliente B, Coach y Admin: **4/4 idénticos**. Tras migración el readback mantiene cliente A 0, cliente B 0, Coach 2245, Admin 2245. NUEVO hash RLS `0a4730122eda42e36e12c8a4dc8a2220`, ANTERIOR `8e39f8cd8bc1fee7502232acf50aadd9`. Rollback SQL versionado restaura la política original. Ningún PDF eliminado, ningún dato/ACL modificado.
- **Rendimiento QA no controlado, no presupuesto:** Coach muestra ~24ms/276 bloques en ensayo transaccional; tras migración otro EXPLAIN Coach **2,675ms / 360 bloques**, Cliente A 1,742ms, Admin 1,724ms. El ahorro de CPU en esta lectura es importante, pero **no demuestra ahorro de GB facturables, menor factura ni resultados idénticos en PROD**. No cambiar PROD sin migración y certificación independientes. Mantener #1209 OPEN.
- **Gates:** 1 PR vertical de QA, contratos SQL y rollback, CI y E2E/roles/RLS por SHA exacto, deploy Canary, 11/11 después de squash. No tocar el bootstrap: el prototipo anterior rompía 1319 referencias.

## SUPABASE FREE 360 · segundo aviso RLS idéntico eliminado en QA · 17/11/2026
- La última advertencia `multiple_permissive_policies` se originaba en `public.iri_report_withdrawals_v1`: dos políticas SELECT para authenticated con predicado idéntico y MD5 `250d86448fd9a39e4ee38e33d17f03c5`. La tabla tiene 0 retiradas en QA; el valor de esta corrección es simplificar políticas redundantemente ejecutables y evitar deuda/performance futura, no se atribuye ahorro de CPU o GB ya medido.
- Segunda migración de la **misma PR #1360**, exclusivamente QA `20261117143515_p0_free_qa_iri_withdrawal_rls_duplicate_v1` aplicada: elimina solo v2 y mantiene v1 intacta y RLS en activo; `CREATE POLICY` de rollback probado en una transacción revertida, con hash idéntico al original. No se han modificado filas ni permisos, ni se ha tocado PROD. Ambas migraciones de deduplicación RLS tienen rollbacks atómicos independientes.
- Esta segunda comprobación obliga a recertificar el SHA nuevo de la MISMA PR. No usar gates verdes del SHA anterior como aceptación; no fusionar hasta 9/9 del HEAD nuevo.

## SUPABASE FREE 360 · P0 informe IRI RLS + media pública · 17/11/2026 · QA primero
- **Base y control:** Canary SHA `9546ef8e124f35b406b99c6eef93cb96e9d15ffe`, 11/11 workflows de postmerge #1359 SUCCESS, incluyendo Canary Exact Deploy. PROD sigue independiente, sin SQL ni cambios de datos.
- **QA IRI emisión:** se identificaron dos políticas SELECT **literalmente idénticas** en `public.iri_report_issuances_v1` para el rol `authenticated`, mismo predicado `iberfit_can_manage_iri_private_v1(client_id)`, mismo hash `8e39f8cd8bc1fee7502232acf50aadd9`. La tabla mantiene RLS. Se probó en transacción reversible la eliminación de v2, comparando recuento y hash de todos los IDs visibles para Cliente A, Cliente B, Coach, Admin: **4/4 iguales**. La migración exclusivamente QA `20261117142114_p0_free_qa_iri_duplicate_read_policy_v1` se aplicó, con guard de política/entorno, postcheck y rollback independiente. No grant, mutación ni cambio semántico de autorización. El advisor `multiple_permissive_policies` bajó de 2 a 1, pero la autorización por fila sigue costosa (~0,8–1,7s de recuento en QA); no se certifica mayor ahorro de CPU sin datos p95 controlados.
- **Medios públicos:** `src/m26/library/exercise-media.js` añade caché de 60 segundos SOLO de manifiestos públicos aprobados en `sessionStorage`, con validación de esquema, origen/version, máximo 2 MB, invalidación `forceRefresh` y fallback seguro ante errores. Conserva la actual coalescencia en memoria y el TTL de 60s. Ni JWT, ni datos personales, ni IRI, ni informes entran en este almacenamiento. Ahorro teórico en una segunda carga dentro del TTL: **una RPC pública de Supabase y tres GET estáticos** evitados, a certificar con test de recarga/QA; **no extrapolar a ahorro en GB oficiales**.
- **Storage medido en QA:** `iberfit-iri-issued-reports` **2.238 objetos / 165,75MB**; `iberfit-evolution-issued-reports` **234 / 35,08MB**, suma **2.472/200,83MB**. Los nombres de archivo no identifican QA por sí solos; no afirmar que todos son borrables. El 17/11 se crearon 10 IRI (0,74MB) y 2 de evolución (0,30MB). No se ha borrado ningún PDF ni se ha cambiado su auditoría. Evitar nuevos PDF únicamente cuando el classifier `qa_iri_emission_impact_gate` demuestre falta de impacto, conservando E2E para cambios RLS/IRI.
- **Bootstrap:** sigue intacto tras revertir prototipo que dejaba 1.319 referencias antiguas rotas. La reducción de payload no es GO hasta que tenga restauración 100% sin pérdida y wire real con 4 roles + M43. `#1209` permanece abierto. Referencia Usage oficial del último panel del 16/11: 1,109/5GB uncached y 0,286/5GB cached, ciclo 12/11–12/12; no acceso a una cifra de facturación más reciente mediante herramientas.
- **Orden de promoción:** tests y CI exacto PR → QA/Canary exacto → análisis de mejoras/rollbacks → PROD solo previa certificación independiente. QA SQL ya aplicado no significa PROD. Rollback de medios mediante revert de commit; rollback SQL `supabase/qa-rollbacks/20261117142114_p0_free_qa_iri_duplicate_read_policy_v1_rollback.sql`.

## SUPABASE FREE P0 #1209 · optimización integral Cliente/Coach/Admin, QA · 17/11/2026
- Se ha integrado el segundo cuello de botella en la misma PR #1359, sobre el candidato inicial 190234b3ae9b9fd5d7c7cefe840569e63816c654. NO se ha abierto otra PR.
- Migración adicional exclusivamente QA 20261117130542_p0_free_qa_wearable_coach_set_rls_v2 APLICADA en Supabase. Política de consentimientos RLS SELECT para authenticated, hash nuevo de7d8cbf0792c431eedae9a9591a212a, RLS=true, sin cambio de datos, role grants ni PROD.
- Problema verificado: con InitPlan solo de client_id(), Cliente A ya respondía a ~22 ms, pero Coach y Cliente B seguían alrededor de 791ms y 698ms respectivamente en mediciones de RPC aisladas, debido a la función is_assigned_coach(client_id) repetida por registro.
- Mejora segura y condicionada a hashes exactos: conservar literalmente la autorización previa admin OR (coach AND asignación activa a auth.uid()) mediante rol STABLE calculado una vez y conjunto de client_assignments sujeto además a su RLS. Comparación transaccional del JSON antes/después para Cliente A/B/Coach/Admin: 4/4 HASH IGUALES. EXPLAIN de consulta Coach tras reescritura: 5,3ms / 129 bloques hit; no confundir con p95 HTTP ni GB facturados.
- El guard de aplicación exige hash previo de política y hashes de las funciones privadas de rol/asignación, RLS en client_assignments, policy read exacta, GRANT SELECT authenticated ya existente y RLS de consentimientos activo; ante cualquier deriva falla cerrado. Rollback 2/2 obligatorio ANTES del rollback 1/2, ambos con hash y QA guards.
- NO se ha retirado historial, consentimiento ni capacidad, no se han cambiado roles ni autorizado a anon. Siguiente obligación: repetir gates del HEAD nuevo, comprobar seguridad por rol, Device, M43, WebAuthn, Canary exacto y medir latencia real. #1209 OPEN hasta cuota mensual certificada; la optimización es de CPU/DB, no prueba ahorros en egress de Supabase.

## SUPABASE FREE P0 #1209 · QA wearable RLS InitPlan · 17/11/2026 · migración aplicada, PR en certificación
- Canary base exacto `94d803626d29c3b47c4f6f5669a6324bec88b182` después de #1358, con 11/11 workflows finalmente SUCCESS tras reintentar solo el job Firefox fallido una vez. Esto NO acredita estabilidad futura del disclosure.
- **Migración exclusivamente QA** `20261117125214_p0_free_qa_wearable_consent_rls_initplan_v1`: cambia solamente la política SELECT `m26_wearable_consents_read_v44` para evaluar la función STABLE `iberfit_client_id()` como InitPlan `(SELECT ...)` una vez por sentencia, sin variar el OR de `is_assigned_coach(client_id)`. Idéntico conjunto de registros autorizado. Política original MD5 `0b38f8e1d6bf70894f2e33f29ee36e5c`, nueva MD5 `a6ea1799ffd432d13b6b607612f40f52`; migración atómica con guards de origen, entorno QA, SELECT, RLS activo, roles `authenticated`, y estabilidad de funciones. Rollback independiente fail-closed incluido.
- **Medición SQL QA**: consulta de consentimientos 166,4ms/3829 bloques hit original -> 2,95ms/159 bloques hit con cambio transaccional temporal. `m26_wearable_bootstrap_v44()` 219,5ms original -> 7,9ms con prueba temporal; después de aplicación efectiva, primera muestra 31,45ms. Las muestras individuales **NO** acreditan SLA p95 ni ahorro económico en GB.
- Se comparó el hash del JSON autorizado antes/después de la política en una transacción revertida para Cliente A, Cliente B y Coach sintéticos: **3/3 iguales**. Ningún permiso ni dato mutado. Tabla con RLS habilitado, política SELECT exclusiva `authenticated`, post-readback verificado. NO PROD.
- El riesgo económico mayor persiste en bootstrap de QA Cliente A: 1,68MB decodificado / ~290KB wire por inicio y p95 gateway ~3,4s; esta optimización de RLS reduce carga de CPU/DB, **no reduce automáticamente transferencia**. Medir Usage Summary oficial de 12 Nov–12 Dic antes de declarar Free sostenible; #1209 sigue OPEN y PROD protegido.
- El código/PR es candidato hasta CI real, QA write, Device, WebAuthn, Canary SHA y proof de no degradación; la aplicación previa de SQL QA no significa promoción productiva. Rollback antes de cualquier reversión que cambie funciones/RLS base.

## SUPABASE FREE · PR #1358 QA · 17/11/2026 · corrección en curso, sin PROD
- **Estado base** Canary `d586b2b41b7fcae48b290af14ceab168faa68229` tras #1357 con 4 checks push fallidos: un bootstrap QA 500/8,9 s, un inicio Client fuera SLA 10 s y un intento redundante de desplegar dos funciones IRI cuando sólo cambió la infraestructura CI (bundler exit 135). No inventar regresiones de aplicación; no ocultar los fallos.
- El primer candidato de preferencias bajo demanda *no era aceptable*: los tests existentes M45 demuestran que la hidratación remota al montar la aplicación protege sincronización entre dispositivos, bandeja Coach y continuidad de entrada. **Se ha retirado antes de fusionar**; sigue leyendo preferencias remotas en montaje, cambio de cuenta y reconexión exactamente como antes. La disminución de esas ~724 llamadas observadas NO se declara lograda.
- **Ahorro seguro mantenido:** un mismo actor, al repintar el control push, reutiliza durante 30 segundos el último estado UI confirmado en memoria (no tokens/respuestas persistentes). Cambio de actor, reconexión y acción explícita fuerzan revalidación. Tras éxito de activar/desactivar se elimina una consulta push repetida; errores y acciones mantienen recuperación y control de habilitación de botones. Sin RLS, SQL ni datos PROD.
- **Corrección fail-closed IRI:** para cambios de workflow de certificación, comparar cabecera y cinco pasos IRI exactos de base y HEAD mediante git show local; si difiere, falta o falla lectura, ejecutar informe. Cambios sólo del programador CI no necesitan recompilar brokers PDF intactos; cambios SQL, seguridad, funciones y dispatch siguen exigiendo certificado. No se reduce la cobertura de escrituras ni el gate IRI cuando se altera su código.
- Fast Lane y auditoría previos detectaron errores del propio candidato; se corrigieron ANTES de dar GO. Las pruebas de CI y navegador exact SHA deben certificar esta nueva revisión. No fusionar con gate rojo ni cambiar 10s SLA.
- Baseline financiero oficial All projects 12 Nov–12 Dic 2026: egress 1,109/5 GB uncached, 0,286/5 GB cached, objetivo interno ≤4 GB; monitorizar tras despliegue, no confundir conteos HTTP con GB. #1209 OPEN.
## SUPABASE FREE P0 · deduplicación de certificación QA por SHA + medición de wire sin red adicional · 16/11/2026
- Base Canary verificada \`4e4b0efd8d30b860431c681e0b00f1a950ac0ead\`: PR #1356 squash, despliegue Cloudflare exacto y 34 checks posteriores SUCCESS + 2 SKIPPED + 0 FAIL.
- La nueva puerta QA Real Write compara mediante **solo GitHub API** el workflow, rama y HEAD exactos; si una ejecución anterior real ya terminó SUCCESS o está corriendo/encolada, bloquea la segunda batería duplicada. Draft/skipped/failed/cancelled/otro SHA no sustituyen una certificación. Ante error GitHub la puerta falla cerrada y no llama Supabase. Push postmerge conserva todas sus pruebas; no cancela escrituras.
- Observador read-only Playwright cuenta tamaños de transferencia de todas las respuestas completadas mediante request.sizes() local sin nuevas solicitudes HTTP, sin payload ni tokens en logs. No equiparar wire del navegador con GB facturables de Supabase; no reduce egress por sí mismo.
- El resto de las pruebas reales E2E, MFA/WebAuthn, RLS, Coach–Cliente, Admin y Client, PWA, idempotencia no se elimina ni suaviza.
- Baseline oficial org 12 Nov–12 Dic: uncached egress 1,109/5 GB, cached 0,286/5 GB, Log Query 40,828/100 GB, objetivo operativo ≤4GB uncached y margen restante ~116MB/día como aproximación al 16/11. #1209 sigue abierto. Ningún SQL ni dato PROD/QA modificado. Un PR principal, CI y Canary exacto, rollback por revert de GitHub.
\n## P0 SUPABASE FREE · Macrobloque coalescencia de lecturas autenticadas QA · 16/11/2026
- **Problema y presupuesto**: captura oficial org Free current cycle 12 Nov–12 Dic: uncached egress 1,109/5GB, cached 0,286/5GB, Log Query 40,828/100GB, DB 0,215/0,5GB, Storage 0,233/1GB. Objetivo interno 4GB uncached y 4GB cached, con media restante ~116MB/día. 16.866 de 22.253 solicitudes gateway QA (75,8%) HeadlessChrome; PROD 167 en la misma ventana. No inferir bytes facturables de solicitudes ni de headers ausentes.
- **Optimización vertical**: coalescer QA **en memoria y solo mientras la misma petición de lectura está pendiente**, agrupado por JWT exacto, función, argumentos y transporte; 64 operaciones simultáneas máximo. Acaba al completarse o fallar, no guarda tokens/respuestas en Storage, IndexedDB, localStorage, sesiones o cachés compartidas. No unifica usuarios, roles ni parámetros; no cambia callbacks ni proceso de autorización, y no reaprovecha respuesta settled. La ruta principal incluye assurance read-only, backend read-only, wearable read-only, GET user y command registry. Extensiones independientes: RC39 roles/cambios, comunicación bootstrap/status, Admin contexto. Solo QA `runtime.qaOnly===true`, PROD no cambia. No intercepta MFA/refresh/logout, escrituras, ejecuciones de sesiones, historia paginada, canonical bootstrap, RPC con señal de cancelación o HTTP de mutación.
- No se amplían expiraciones JWT, timeouts ni excepciones de error. 403/401/red quedan propagados; cada sesión nueva consulta de nuevo. Los permisos dependen del servidor PostgreSQL/RLS. Test unitario verifica misma JWT 6 concurrentes→1, dos JWT diferentes→2, cambios de scope, 403 no memorizado, nuevo GET siempre fresh, PROD sin coalescing, y mutaciones nunca coalescidas.
- **Alcance económico**: sólo ahorra duplicaciones *concurrentes* dentro de un mismo contexto de navegador. No reduce las miles de peticiones de tests seriales/nuevas sesiones y no puede prometer ahorro del 50% de la cuota; medir antes/después con logs y egress oficial. Evitar sobre-ejecutar certificaciones sólo para obtener medidas.
- **No SQL/DDL ni producción**; una rama/PR con CI full y E2E QA exact SHA antes de fusionar o desplegar. #1209 OPEN hasta cuota mensual real validada. Rollback inmediato: revertir sólo el commit frontend después de gates. No tocar clientes ni #1319.

## Supabase Free #1209 · QA 4 MB + auditoría live GET resiliente · 16/11/2026
- PR #1355, base `9265815f55e9a9d4e9c08f271227299f12959fc1`. Migración QA `20261116204059_p0_free_qa_bootstrap_workmem_4mb_v1` **APLICADA**. Función bootstrap MD5 `9c83765e0a36b0144fde2dca4a0cdcba`; cuerpo original (excluyendo atributo work_mem) MD5 `a71e8ccd806ae1e783799cc1a6e2efce`, mismo owner, ACL, RLS, anon denied; global PostgreSQL y PROD siguen a `2184kB`.
- `pg_stat_statements` tras aplicación: 4.079→4.098 llamadas, contador temporal escrito permanece en 1.621.088 bloques; EXPLAIN después 0 temp blocks / 3.144ms, **no** certifica SLA estable ni ahorro de GB.
- Incidencia repetida audit-read-only externa en `https://app.iberfit.cl/m26/version.json`: `LIVE_READ_FAILED fetch failed` aunque 15 comprobaciones de seguridad/roles habían pasado. El GET público sin credenciales usa helper preexistente `readOnlyPublicProbeWithRetry` exactamente **una** vez ante TypeError, AbortError o TimeoutError, pausa 250ms con timeout independiente por intento. Cualquier HTTP 403/500/JSON malformado sigue FAIL y segundo fallo de red se registra CRITICAL. Evita ejecutar 6.600 tests de nuevo por un solo fallo transitorio, sin eliminar la comprobación de producción.
- Una sola PR, código candidato: pendiente certificación exact SHA, CI completo, pruebas autenticadas/device/QA real/Canary policy, despliegue protegido y readback. Rollback de 4MB debe preceder al de paginación QA 64; no tocar PROD. Mantener #1209 abierto hasta validación facturación Free.

## SUPABASE FREE 360 · P0 #1209 · QA function-local bootstrap work_mem pilot · 16/11/2026
- **NO PROD, one candidate PR.** Base Canary exact `9265815f55e9a9d4e9c08f271227299f12959fc1` after #1354 squash and Canary exact deploy certification. Read-only measurements QA synthetic Client A: default `work_mem=2184kB`, `EXPLAIN ANALYZE` 2.387 s / 864 temp blocks; statement-local `4MB` 1.774 s / 0 temp blocks. 8MB similarly zero temp (1.738 s), rejected in favour of bounded 4MB. These are sequential, nonrandomized single-query samples; do NOT claim an overall SLA or financial egress improvement.
- Long-run `pg_stat_statements` QA shows ~4,079 bootstraps at ~1,230 ms average, 1,621,088 temporary blocks written cumulatively, ~3.26MB avg temporary I/O per call. Counters are cumulative and not current billing egress.
- Change: `ALTER FUNCTION public.iberfit_bootstrap_v26() SET work_mem TO '4MB'` **only inside QA** after exact source/owner/ACL/GUC/hash and opt-in guards. No global/postgres.conf/ALTER SYSTEM/RLS/role changes; no PII, no data manipulation, no PROD. Rollback resets function attribute to original `2184kB` default; reverse order BEFORE #1354 pagination rollback. Existing Client A/B cross-owner and 300KB page cap unchanged.
- **Certification required**: migration atomic apply QA, verify readback hash/proconfig/ACL, full Node/CI, device authenticated 10s SLA, Canary exact deploy and postmerge checks, SQL plan parity and egress observation. No PR merge with any failure or outstanding gate. #1209 remains OPEN until current-cycle official uncached/cached usage proves monthly sustainability.

## SUPABASE FREE 360 · QA role JWT resilience · 16/11/2026 (PR #1354)
- Real QA gate M42 avatar cross-owner hit PGRST303/401 in the read-only \`iberfit_current_role_v26\` call immediately after synthetic Auth login (run 43921150424), while authenticated-client, isolated-write and Connected360 checks passed. This is an independently observed failure, not proof of future-iat until payload class is validated.
- The candidate adds up to three delays (350/800/1300 ms) **only** for exactly \`PGRST303\` + message \`JWT issued at future\` + status 401 and only for the two known non-mutating RPCs \`iberfit_bootstrap_v26\` and \`iberfit_current_role_v26\`; uses identical JWT, never retries arbitrary 401/403, writes, expired/revoked JWT, or changes a negative RLS result. The original test remains mandatory; a persistent error fails closed.
- Dedicated unit tests cover recovered/skew exhausted/expired/forbidden/other RPC and same bearer. No PROD changes, Auth/RLS/Storage/GRANT or personal data touched.
- Still PENDING new exact SHA complete CI, M42 real QA pass, device and deployment; #1209 open.

## SUPABASE FREE 360 · QA page64 · candidato 16/11/2026 (NO PROD)
- Base Canary: d5294d338f24da1eeeda8ede129ac9170ba9c1f7. Única rama/PR sobre #1209.
- QA read-only synthetic Client A: 699 sesiones + 716 ejecuciones; 32 filas => 45 páginas (22+23), 64 filas => 23 páginas (11+12). Mayor lote saneado de 64: 214982 bytes sesión, 79633 ejecución (<300000 por página).
- Alcance: solamente historial Client A QA en demanda; tres funciones SQL encadenadas (lector, rc29, bootstrap) con hashes, owner y ACL exactos, rollback; sin datos/roles/permiso nuevo, Auth, RLS, Storage, PROD o #1319.
- Estado a la creación: código candidato, SQL NO aplicado, CI y pruebas reales pendientes. Esta proyección no es GB facturados ni reducción certificada, y #1209 sigue abierto.

## REAL TRAINING 360 · P0 CORRECCIÓN DE GATE PROD · 15/11/2026

- Baseline protegido `e081c4cc0bb029e1694d6dd81dae69895158b179`. Los runs postmerge [#43730961140](https://github.com/iberfit/iberfit-m26-app/actions/runs/43730961140) y [#43731651999](https://github.com/iberfit/iberfit-m26-app/actions/runs/43731651999) acabaron `HTTP_400` en el inspector automatizado. **No se ejecutaron migraciones, grants, escrituras ni deploys PROD.**
- Diagnóstico verificado directamente en PROD: `supabase_read_only_user` tiene USAGE sobre `pg_catalog`, `public`, `private` y `supabase_migrations`, puede SELECT `supabase_migrations.schema_migrations` y ejecutar `pg_get_functiondef`, pero **no** puede ejecutar `public.iberfit_environment()`. Las tablas de negocio permanecen cubiertas por RLS. Prohibido añadir permisos para un test.
- Corrección del inspector: usar `POST /database/query/read-only`, que Supabase ejecuta bajo rol de lectura, con **únicamente un SELECT de catálogo**: historial completo de 225 migraciones y SHA-256, funciones/huellas del preflight U72, RLS y grants de U60, triggers y existencia de objetos WebAuthn. No invoca RPC de negocio ni consulta filas privadas de clientes/sesiones.
- La salida **no certifica** número de comandos ni sesiones activas, configuración de entorno productivo, Hosted Auth/Vault o rollback. Se marcan `UNVERIFIED_PROTECTED_RLS` y `productionReady:false` / `backendPromotionAuthorized:false`; exige un paso separado y autorizado con las fuentes privilegiadas antes de GO.
- Tras merge se requiere **SUCCESS del job real en PROD** con JSON `catalog-only-no-go.v2`; si la API continúa dando error se debe diagnosticar el código SQLSTATE sanitizado, no ignorarlo, ni modificar RLS. La limpieza selectiva #1319 sigue excluida.

---

## HOTFIX P0 · Lectura real de catálogo PROD con RLS inalterada · 15/11/2026
- Base protegida previa `ee4170651e6a3f771368e45812748861b64b5ddc` y PR #1344 mergeada. El workflow read-only postmerge [#43730961140](https://github.com/iberfit/iberfit-m26-app/actions/runs/43730961140) abortó con HTTP 400; NO realizó DDL, grants ni escrituras.
- **Causa raíz verificada con `has_function_privilege` sobre PROD:** el endpoint Management `/database/query/read-only` ejecuta como `supabase_read_only_user`; ese rol NO puede ejecutar `public.iberfit_environment()`. Además carece de visibilidad RLS sobre registros privados de catálogo; no debe recibir permisos nuevos. La misma consulta de solo lectura funciona en el conector Supabase con el endpoint `/database/query` y `read_only:true`.
- Corrección: mantener un `SELECT` único, objetivo PROD fijo, SHA protegido y resultado agregado NO-GO, pero utilizar exactamente `POST /database/query` con `read_only:true` (API Supabase beta), siguiendo la vía del conector oficial. Nuevos tests comprueban ruta, verbo y bandera obligatoria. **Prohibidos** cambios RLS, bypass mediante grants, lecturas privadas, secretos y activación U60/U72. La prueba real postmerge determinará si está resuelto; no afirmar SUCCESS antes del HTTP real.

---

## REAL TRAINING 360 · P0 PRODUCTION RELEASE FIREWALL · 15/11/2026

- **CANDIDATO BASE INMUTABLE:** Canary `cf9283ec321ca12e7df47bf18b450f5a8337c899`, PR #1343 fusionada; 15/15 workflows postmerge SUCCESS tras reintento explícito de Device Experience. Canary Cloudflare exact SHA certificado; PROD no actualizado.
- **Causa raíz de riesgo productivo:** `Final Production Bundle` construía `FINAL_PRODUCTION_PROMOTION.sql` desde el preflight 31/08/2026, que exigía ausencia de RC74/WebAuthn, solo 52 comandos y hashes de funciones previas. Verificación Supabase PROD de solo lectura del 15/11: **14 migraciones clave ya aplicadas (225 versiones en total, última 20261107144120, huella del ledger SHA-256 1fb4006546cc2f1eec6aa3e128e3d0f9ec80d76d43bb955127866033e186de4e), RC74 y WebAuthn presentes, 58 comandos activos, U60 privado instalado pero EXECUTE authenticated=false/anon=false** y 0 ejecuciones legacy o locks activos en el instante de lectura. El artefacto antiguo **NO ES EJECUTABLE SEGURO**.
- **Corrección preparada:** reemplazar artefacto SQL automático por una verificación catalogal exclusivamente READ-ONLY contra el proyecto PROD exacto, ligada al SHA Canary y versionada como `production.current-baseline-observation.v1`. Emitir solo JSON sin PII ni secrets, con `legacyPromotionSqlRejected:true`, `backendPromotionAuthorized:false`, `productionReady:false`. El generador histórico queda disponible únicamente para tests de compatibilidad, no para exportación CLI.
- **U72 compatible sin instalar:** se contrastaron en PROD por SQL READ-ONLY las huellas MD5 exactas del instalador U72 ya existente: gateway `5914acf371015a6bbeeaf95f99e056e3`, lectura privada `35862b8e4977fcf0c3d611937fe83126` y trigger de recibo `f97d7df4fdd510b63ac1249352273927`; 2 triggers activos, U72 todavía ausente, U60 y detail no ejecutables por authenticated, 0 ocurrencias activas al observar. Los instaladores protegidos y rollback U72/U60 ya están en `supabase/release-procedures`: REUTILIZAR, no duplicar. Preflight compatible **no es GO**: depende de M44 Hosted Auth/Vault/ACL, egress y prueba productiva.
- **NO-GO sostenido:** esto no constituye nueva migración de U72 ni grant U60. Antes de cualquier cambio productivo quedan delta actual reversible, paridad funcional Hosted Auth/Vault/JWT/Edge secrets/ACL, validación de rollback de privilegios, métrica egress facturado, smoke físico LIVE Cliente/Coach/Admin y prueba de segunda fecha. El M44 real solo restauró PostgreSQL aislado y 137 objetos Storage; cardinalidad Auth/Vault no certifica arranque de plataforma.
- **AISLAMIENTO:** no se altera ni se borra a los clientes reales; PR #1319 de supresión selectiva sigue fuera. No se ejecutó ningún SQL de escritura, migración, Edge deploy o activación PROD durante esta intervención.

---

## REAL TRAINING 360 · U74 QA recuperado y FRENTE de release · 15/11/2026
- **RECUPERACIÓN REAL QA COMPLETADA:** run [#43716735183](https://github.com/iberfit/iberfit-m26-app/actions/runs/43716735183) intento 2 SUCCESS en Chromium touch con escritura auténtica solo sobre la ocurrencia sintética firmada del intento previo. Coach hizo lectura independiente, Cliente B denegado. Fuente QA PostgreSQL READ-ONLY posterior: fecha 15/11 `completada`, revisión de ocurrencia 3, ejecución `cerrada_confirmada` revisión 6, **2 series persistidas y feedback presente**; fecha 22/11 `confirmada`, sin ejecución. Sin borrado, cancelación ni cambios PROD.
- **FALLOS DE GATE del SHA anterior `9caa1cc0ee79c4874e447aaea2de14abd0199cc6`:** una cadena por traducir a EN/FR/PT bloquea `m26_i18n_residual_gate`, CI y Canary Policy. Se incorpora catálogo de cuatro idiomas + test (no exclusión ni relajación de auditoría).
- **M44 QA Edge:** en 15/11 13:04 UTC, negativa de PDF produjo en un intento 404 `NOT_FOUND_FUNCTION_BLOB` de gateway Supabase, junto con 403 y 404 JSON de dominio; no es evidencia de fuga, **tampoco certificación de disponibilidad ni denegación MFA de la función**. Los cuatro archivos de la Edge function QA versión 9 ACTIVE `verify_jwt=true` coinciden byte a byte con el repo. La prueba ahora distingue un 404 de gateway de un rechazo real de negocio y falla cerrado; no se encubre como success.
- **SIGUIENTE CERTIFICACIÓN:** SHA nuevo completo, U74 nueva fixture dos fechas y ACK serie a serie, U71 backend nueva fixture después de U74, QA RLS negativa, M44, Device, WebAuthn, CI y Canary. Mantener sin merge/PROD si un gate falla o si no se comprueba recovery Hosted Auth/Vault, backup PROD fresco, U72/grants U60 y rollback.

---

## REAL TRAINING 360 · 15/11/2026 · diagnóstico E2E y cierre de clics perdidos (PR #1343)
- SHA previo `3ee26fb00c98855d53f3c9b5cc923cf60d805a40`: **13/15 workflows SUCCESS**, U71 [#43679537393](https://github.com/iberfit/iberfit-m26-app/actions/runs/43679537393) segundo intento FAIL-CLOSED `U71_QA_CLIENT_ACTIVE_EXECUTION`; U74 [#43679537387](https://github.com/iberfit/iberfit-m26-app/actions/runs/43679537387) creó dos fechas, inició/pausó/reanudó y guardó una de dos series; el navegador no encontró feedback final. Los preflights pasaron y no hubo modificaciones PROD.
- Lectura privada agregada QA: dos ocurrencias nuevas, primera `en_curso` revisión 2 / ejecución revisión 4 con una entrada de resultados, segunda `confirmada`; U71 bloqueó otra ejecución de ese mismo cliente sintético. No eliminar, cancelar, fabricar feedback ni repetir un E2E con la misma fixture.
- Corregida la carrera de acciones U60: al estar `busy`, deshabilitar botones tanto en navegador como teclado incluso tras re-render, mostrar estado accesible de guardado; en Playwright exigir **ACK de cada serie y salida de busy** antes de pulsar el siguiente control. Un botón simplemente visible no garantiza haber procesado la escritura anterior.
- El entrenamiento sintético inacabado debe recuperarse mediante acción autenticada, scope y CAS originales y verificación del histórico, sin borrado ni bypass. La nueva revisión CI/QA requiere SHA exacto; sin recuperación U74/U71 y M44 real, **NO MERGE, NO PROD**.

---

## REAL TRAINING 360 · 15/11/2026 · checkpoint HEAD 66632e9 (PR única #1343)
- GitHub verificado: PR #1343 OPEN, Canary base `1b08e418d166ae502fe6bb2df83f01d0da186d35`, HEAD previo `66632e91053b433a66115a82c35a1dabfeb6d2b3`. **13/13 workflows de ese SHA SUCCESS**, con verificaciones CI/Device/WebAuthn/Audit/QA Real Write/M44 sintético; el éxito agregado NO sustituye comprobar jobs omitidos ni certificar un HEAD nuevo.
- Reforzado en este mismo PR el filtro de escrituras QA U74 con whitelist exacta de cargas U39 (inicio, pausa, reanudación, progreso y finalización), objetos de progreso estrictos, cota de bytes y regresiones de campos ajenos; se requiere recertificación por SHA antes de merge.
- M44 backup/restauración real PROD **SKIPPED** en PR por política. Ensayo PG17 sintético de snapshot/censo aprobado; faltan backup productivo fresco y recuperación funcional Hosted Auth/Vault/roles/secrets.
- Supabase QA/PROD ACTIVE_HEALTHY. U60 EXECUTE authenticated=true QA y false PROD; U72 público ausente en ambos. Auditoría read-only, sin mutaciones DB, Auth, Storage ni #1319.
- QA observado: 107.152 auth.sessions y 107.152 refresh tokens; 1.218 sesiones creadas en 24h y 162 en última hora (tres actores sintéticos). Causa compatible con login en CI, **no atribuida concluyentemente**; no purgar/revocar sin diseño. Bootstrap QA: 2.514 llamadas, media 1.253,9 ms, máximo 7.910,6 ms, 1.138.432 bloques temporales escritos acumulados.
- **NO-GO productivo:** egress facturado comparable, bootstrap bajo SLA, M44 Hosted Auth/Vault/Edge real, respaldo nuevo, U72 SQL+rollback y grants U60 controlados, RLS negativa, Canary LIVE exact-SHA, smoke Cliente/Coach/Admin y hardware Connected360. La eliminación destructiva #1319 permanece completamente fuera.

---

## U74 · Cliente real desde Chromium QA · candidato en PR #1343 · NO CERTIFICADO
- Se ha preparado, en la MISMA rama/PR, un workflow con **primer intento estrictamente READ-ONLY** sobre cuentas sintéticas reales de QA. Solo un rerun explícito del MISMO run, SHA y fecha certificada permite preparar dos fechas y ejecutar la primera en el navegador real; Coach comprueba la finalización y segunda fecha intacta.
- La autorización adicional del navegador solo cubre cinco comandos U60 de entrenamiento sobre **una** ocurrencia QA prevalidada. Se prohíben altas, cancelaciones, lotes, otras fechas, otros clientes, service_role y URLs de PROD.
- Esta es preparación de código sin E2E U74 aceptado. Un preflight sin franja válida abortará sin datos escritos. Si se interrumpe tras crear fechas, no repetir escrituras automáticamente: investigar el fixture y conservar evidencia.
- No cambiar los permisos U60 de PROD, no ejecutar SQL U72 productivo, no modificar clientes reales.

## REAL TRAINING 360 · PR #1343 · 14/11/2026 · READY PARA GATES (NO DESPLEGADO)
- **Rama única:** `feat/iberfit-real-training-360-20261114`. Base de integración Canary/PROD del último checkpoint: `1b08e418d166ae502fe6bb2df83f01d0da186d35`. PR #1343 está Ready for Review para habilitar gates autenticados; no está fusionada ni equivale a LIVE.
- **Mejoras en PR:** reloj de inicio U31 anclado al ACK oficial del servidor y validación del clock en pausa U72; registro de serie + avance en UNA transacción local cifrada/corrección de pérdida de cursor; U71 preflight de dos fechas bajo acceso QA y proof de igualdad hora ACK/lectura privada (una sola rama y un replay explícito si procede).
- **U71 real**: workflow [#43665264998](https://github.com/iberfit/iberfit-m26-app/actions/runs/43665264998) attempt 1 y 2 SUCCESS: JWT reales QA sintéticos Coach/Cliente A/B, dos fechas, primera completada, segunda confirmada, RLS negativo, pause/resume y hora ACK=readback; QA 24→26 ocurrencias (13 completadas, 13 confirmadas). No certifica interfaz con escritura.
- **Certificación del HEAD previo `f85e55f1b0bad0fd1cce48faf5b4c6d8efef541b`:** CI #43659871326 SUCCESS, Fast Lane #43659871341 SUCCESS, Continuous App Audit #43659871306 SUCCESS. No transferir éxito al siguiente SHA.
- **Supabase PROD permanece protegido:** U60 autenticado sin EXECUTE, U72 ausente. QA U60/U72 disponibles; no concede funcionalidad PROD. #1319 limpieza destructiva excluida. No se han borrado personas ni tocado Auth, Storage o SQL productivo.
- **Bloqueadores persistentes:** U71 real hosted E2E, M44 reciente + Hosted Auth/Vault DR, RLS multirol, fotografía IRI, rendimiento/egress, Connected360 Android hardware real, Canary exacto y promoción productiva protegida. No promover sin DO-D real.

## IBERFIT UNIVERSAL 360 · PR #1341 · 14/11/2026 · ÚNICO WIP, DRAFT, NO PROD
- **Base autorizada**: Canary `canary/rc74-4` `67cdea194cb0ee87acebde0a89f9487d68ccec7b`, PR #1340 anterior fusionada, frontend-only PROD ya certificado vía workflow #43607772622. La nueva PR #1341 **NO** está fusionada, no desplegada y no habilita backend.
- **Mejora real en rama**: bienvenida automática para instalar la PWA desde la llegada de nuevos Clientes a `app.iberfit.cl`, incluyendo Android Chrome (evento nativo con gesto, fallback menú), iOS Safari (Añadir a pantalla de inicio), estilo SIGNATURE 360 y respuesta «Ahora no». Reutiliza manifest, SW y controlador; sin tokens, PII, datos ni SQL; no tapa MFA, login, Auth callback, diálogos o entrenamiento activo.
- **P0 invitación real (mismo PR)**: el enlace Supabase `inviteUserByEmail` usa `type=invite`, anteriormente rechazado por el lector exclusivo `type=recovery`; ahora ambos tipos explícitos reutilizan el flujo seguro `update-password` con caducidad, rechazo de duplicados, borrado obligatorio del fragmento ANTES de render, GET de identidad real, PUT contraseña y revocación POST al finalizar. No se aceptan magiclink/signup ni se copia JWT a persistencia. UI distingue bienvenida del primer acceso frente a recuperación. Validación de enlace real/proveedor en PROD todavía pendiente.
- **Evidencia del HEAD previo `2b4d580cfe6dab08341ffbd092345dda3554431c`**: CI Linux #43611527317 SUCCESS; 6.535 tests Node aprobados/0 errores; 12/12 Chromium PWA suite desktop/tablet vertical/tablet horizontal/mobile SUCCESS, upgrade N-1→N, Lighthouse y RC74.4 SUCCESS. El HEAD siguiente que añade pruebas de iOS/nativo requiere **nueva** certificación; no transferir verdict del SHA anterior.
- **Separación de entornos verificada**: Supabase QA `gjztkdwfmunnzhtvxrsu` RPC `public.iberfit_occurrence_api_u60_v1(text,jsonb)` EXECUTE authenticated=true, anon=false; en PROD `pjhmrhejsoofmouedavw`, authenticated=false y anon=false, sin U72 público visible. No se han mutado permisos ni datos.
- **Riesgo confirmado**: QA `pg_stat_statements` `iberfit_bootstrap_v26()` 1.826 llamadas, media 1315,8ms, máximo 7910,6ms, temp_blks_read/written acumulados 895.920/895.920. Exige EXPLAIN/Buffers de rol sintético y equivalencia before/after; no ampliar timeouts indiscriminadamente.
- **Bloqueos integrales vigentes**: #919/#1078 E2E Cliente–Coach; Coach <5s; U60/U72 segunda fecha/pause/resume y backend PROD; #1209 GB egress facturado; #1262 IRI fotogrametría; Connected360 Android físico; M44 Hosted Auth/Vault restauración. #1319 borrado destructivo en PR separada sin ejecución. No simular aceptación ni modificar clientes vivos.
- **Certificación pendiente**: nuevo CI en SHA exacto, Device+WebAuthn+QA real con PR Ready, respaldo M44 integral/rollback, merge protegido Canary, promoción controlada PROD y smoke de Cliente/Coach/Admin. Un PR DRAFT y tests previos no equivalen a código en PRODUCCIÓN.

## M1/U72 · Reconciliación SQL canónica · 13/11/2026 · PR #1335, NO PROD
- Ante SonarCloud 39,2% de duplicación en código nuevo (máximo 3%), los cuatro cuerpos SQL U72 estaban duplicados entre migraciones QA y procedimientos PROD. No se modifica la migración ya aplicada en QA ni se omite Sonar.
- Refactorización candidata: plantillas PROD fail-closed y generador de un solo origen con verificación de blob Git exacto; SQL materializado de instalación/rollback debe ser **byte a byte idéntico** al SQL PROD aprobado originalmente, preservando ambiente, transacción, hashes, CAS, ACL, RLS y reversibilidad.
- Estado: pendiente de pruebas de HEAD, revisión de SonarCloud y aprobación de todos los gates. No aplicar scripts productivos, no abrir U60, no tocar datos, Auth ni eliminación de personas.

## SIGNATURE 360 · evidencia QA sintética por RUN · 13/11/2026

- PR visual aislada #1336, SHA candidato anterior `d4294499841d4c6035272fe09a5738b0e94703e4`, sin cambios de producto desplegados.
- Canary Policy, SonarCloud, CI, Device Experience, evidencia visual, WebAuthn Coach/Admin, matriz Admin y sesiones aisladas **SUCCESS** en ese SHA.
- QA Real Write workflow `43510763626`: el recorrido autenticado M43 Cliente reportó un HTTP `500` de `iberfit_bootstrap_v26` tras una ejecución sintética en su primer intento. El rerun del job dentro del MISMO run fue rechazado de forma esperada por `M43_SYNTHETIC_FIXTURE_ALREADY_COMPLETED_NEW_RUN_REQUIRED`, sin repetir writes sobre la sesión ya confirmada.
- Se exige una certificación completa nueva con **nuevo run_id y nueva fixture sintética**; no editar tests, datos QA ni backend, no omitir el gate, y no fusionar si el 500 se reproduce.
- Evidencia M44 previa independiente y cifrada run `43509486165`: backup PROD DB+137 objetos Storage, PG17 restauración aislada y verificación de hashes; aplicar además vencimiento estricto y verificación exacta al promover. No acredita recuperación completa de Auth alojado.
- Este checkpoint documental NO altera archivos desplegables, CSS, Auth, SQL, permisos, sesiones ni el diseño aprobado `d8f5e210cbac5a2bf529cd4497f073e805f22c04`.

## SIGNATURE 360 · PR #1335 · candidato local 13/11/2026, NO PROD

## SIGNATURE 360 · entrega exclusivamente visual · 13/11/2026 · NO DESPLEGADA

- Base LIVE y Canary verificadas: `7790bf66e93edb01faf98a1ebdcbd8e410d998bb`. Rama aislada `design/signature-360-visual-only-20261113`; no fusionar #1335 para publicar este diseño.
- Recupera solo los parches visuales c21a451e, 08290bbf, 89ac9479, 3215ffb5, 4a606ffd, 197289f7 y la parte UI/pruebas de 8d7da1df. Excluye U72, lógica funcional pendiente, SQL, backend, Auth, infraestructura y cambios de scripts/workflows de #1335.
- Componentes: CRM directorio/expediente, búsqueda y alta progresiva con continuidad del borrador; composición Coach agenda/clientes y constructor biblioteca/prescripción; catálogo real, jerarquía Cliente y acabados esmeralda/dorado discreto compartidos. Semántica accesible de gráficos y nombres de navegación compacta; conserva bloqueo por cliente y permisos.
- Evidencia local aislada: 301 comprobaciones geométricas; 43 rutas en escritorio/tablet/móvil, 139 capturas del código real con datos sintéticos identificados. Sin incidencias pendientes en la revisión automatizada de cuerpos de ruta; revalidación adicional del shell Coach y gráficos.
- Pruebas: Admin visual 5/5; constructor 4/4; navegación/shell 133/133; gráficos/longitudinal 49/49; contratos visuales/gráficos 38/38. Batería Windows: 6.447 aprobadas, 21 fallos, 1 omitida; dos fallos de finales de línea corregidos localmente y 5/5 revalidados. Los otros 19 requieren entorno Linux/Python/Bash/symlinks; no se declaran aprobados. Build QA canónica correcta.
- Primer CI Linux aislado: 6.467 aprobadas, 1 omitida y un único contrato de orden de atributos HTML fallido; corregido sin rebajar la comprobación de nombres accesibles y revalidado localmente (63/63). Se requiere certificación final del nuevo SHA.
- Pendiente: visto bueno visual del usuario sobre galería aislada; después certificación del SHA exacto, controles de seguridad, M44 backup/restauración y rollback, promoción protegida frontend-only y smoke real en app.iberfit.cl. No se ha ejecutado despliegue ni mutación de datos.

## 11/11/2026 · Cierre evidencia TRAINING B · PR único pendiente de gates (NO PROD)
- Base comprobada Canary `d577e5fb8ffb5d90f86e9e79981a0a5692c4409b`; C PR #1323 ya fusionado. PROD sigue A+B `2a41bc229007a78113eb3c408246445d4c40e783` en el último chequeo LIVE conocido; verificar antes de nueva promoción.
- Corrección propuesta: reconciliación fail-closed por ID/revisión para progreso/Coach y tres estados de entrenamiento basados en evidencia compartida.
- Sin SQL, permisos, Auth, U60 ni datos reales; requiere CI y QA exactos por HEAD, M44 fresco y E2E real antes de declarar LIVE. #1319 destructivo queda estrictamente separado.

## P0 LIVE client deletion privilege boundary · WIP 07/11/2026 (NOT YET MERGED OR PROD APPLIED)

- **Base exacta:** Canary=PROD `f45fecc1d440ce500501ec05452614fedc1c9935`; QA and PROD currently have DELETE grant on `public.clients` for authenticated and anon, and RLS policy `clients_delete_coach`. Admin has a separate protected RPC `iberfit_admin_delete_client_v26(jsonb,jsonb)` with privileged WebAuthn/confirmation/history checks. The direct SQL path bypasses those checks where FKs permit deletion. This is a real privilege issue, not a demonstrated destructive exploit.
- **Single remediation branch:** `fix/p0-universal-client-delete-boundary-20261107`. ACL/policy-only migration `20261107142000_p0_client_delete_command_only_acl.sql` revokes direct DELETE and safely changes the existing Coach/Admin DELETE policy to USING(false), without touching rows, RLS SELECT/INSERT/UPDATE, Auth, photos, or other tables. Unit regression plus a real QA-only Coach and Client negative HTTP gate (nonexistent synthetic UUID, expected 403/42501) in the existing QA Real Write certification workflow.
- **Status:** code candidate prepared for PR, QA certification, merge, and separate controlled PROD migration **PENDING**. Do not claim repaired until QA ACL observed, PR green, exact SHA merged and PROD DB ACL verified. Keep Patricia fully intact; Cynthia/Juan Carlos removal is still pending privileged Admin execution, identity/Storage review, and protected history legal constraints. Frontend promotion alone does not deploy SQL.

---

**P0 UNIVERSAL — revisión diferencial (06/11):** se detectó que el seguimiento indexado por Cliente todavía escaneaba colecciones `sessions` en el motor de planificación/realizado. El índice incluye desde ahora sesiones por dueño y plantillas sin dueño, conservando la semántica original de `buildPlanExecutionSummary`. La paridad 7/28/90 se prueba con sesiones compartidas y contradicciones de `body.clientId`. Se preparó en la única rama un disparador de M44 **solo para un push protegido posterior a la fusión**: no constituye respaldo nuevo, no aplica SQL, no elude `PROD_BACKUP_COMPLETED_BACKUP_MISSING` ni `M44_OFFSITE_RUN_TOO_OLD`. No declarar real WebAuthn, físico o PROD sin evidencia.

## UNIVERSAL 360 · único WIP integral · 06/11/2026 — CANDIDATO NO FUSIONADO

- **Canary base de UNIVERSAL:** `357605902afbd4cce4133ff23b26f383c068550f`, PR #1285 U84 ya fusionada; Canary Exact #42154511757 SUCCESS, auditoría/CI/Cliente/Admin/Device SUCCESS. **Coach WebAuthn REAL #42154511721 FAILURE**: segunda autenticación correcta, historia U38 de 38 páginas, Hoy pasó y Clientes excedió 12s pese a estado + controles DOM finalmente correctos. No elevar timeout ni certificar Coach antes de un recorrido real íntegro.
- **Única entrega UNIVERSAL:** consolida U1–U84 ya integradas y resta de capacidades funcionales sin reintroducir commits anteriores; una rama, una PR principal, una certificación Canary exact-SHA y una promoción PROD protegida. No abrir sucesivas U85/U86/… .
- **Primer conjunto de cambios preparado EN LA MISMA RAMA:** eliminar escaneos globales repetidos del historial Coach en 7/28/90 días mediante proyección por cliente, preservando exactitud, IRI inicial y evidencias; incorporar V47 own-history read con ventana de 30 días y 7 filas estrictas como **migración staged, nunca aplicada automáticamente**. Las 22 capacidades requieren pruebas individuales y no se consideran completadas solo por esta preparación.
- **SQL real:** QA `gjztkdwfmunnzhtvxrsu`: 8/8 migraciones U30–U60 aplicadas; PROD `pjhmrhejsoofmouedavw`: 0/8. Antes de aplicar U30–U60 + V47 en PROD: M44 offsite/restore probado, ACL/RLS/grants, ledger, compatibilidad, backup y rollback. El gateway sigue fail-closed.
- **Producción:** última versión observada en checkpoint `008d8647356c`; confirmar Live directamente antes de promoción. No hay nuevo SQL en QA/PROD, ni despliegue productivo por este WIP.
- **Definition of done:** Cliente Coach Admin reales, auth WebAuthn 2º acceso, navegación con historial completo, Coach→sesión→publicar→Cliente inicia/pausa/termina→persistencia→Coach, varios deportes/fechas, informes y permiso wearable, RLS negativa, todas las pantallas 320/390/834/1024/1440, egress Free medido; una PR y release protegida solo con gates verdes. Mapa maestro #1260 y backlog #1259.

---

## P0 IRI fotografia y optimización Free · WIP seguro · 04/11/2026 (propuesta NO FUSIONADA)

- **Canary LIVE base confirmado**: `c93cccd4e74d9fa2c75fd11a881b612498a2ab26`, Supabase QA `gjztkdwfmunnzhtvxrsu`. **PROD LIVE** `1362e858bfdbba669c5f988d9446084ea22685d5` (Supabase PROD `pjhmrhejsoofmouedavw`); no se ha promovido R50.
- Postmerge PR #1269 en SHA base: seis workflows SUCCESS, pero Coach WebAuthn real #41745218607 **FAILURE**, consola `M26_IRI_PHOTO_TIMEOUT`. Registro privado: MFA `true`, 5 respuestas de estado IRI HTTP 200 + JSON arrays en 0,868–0,932s; no se encontró fallo HTTP de esos cinco GET. **No se adjudica el timeout a Supabase** sin prueba. Device, CI, Audit, Remote, Admin y Canary Exact verdes.
- **Causa adicional comprobada**: etapa opcional Fotografía número 7/8 está inicialmente oculta (`hidden`), pero el controlador se montaba y disparaba `state()` de 5 lecturas PostgREST al detectarla en DOM, aunque Coach no visitara la etapa. Este WIP suprime autolecturas de la etapa oculta; observa cambios `hidden` al abrirla y conserva fetch directo para informe/consentimiento y retry en caso de error. No se modifica seguridad, consentimiento, Auth, JWT, RLS, SQL, funciones Edge, fotografías ni datos de PROD.
- **Resiliencia añadida al mismo WIP**: una carga en vuelo no añade manejadores duplicados; un error visible no se reintenta por mutaciones DOM, exige acción explícita de reintento y preserva el error; un nuevo contexto IRI puede leerse normalmente.
- **Nivel de verificación del WIP**: código candidato + tests dirigidos incluidos en rama independiente; **NO CI/Canary LIVE/PROD certificados aún**. Un solo PR coherente, gate 7/7 SHA posterior y M44 fresco con restore aislado antes de promoción.
- Continuidad y evidencias en issue #1260 y #1262; no repetir CI por cambios cosméticos.

---

## P0 Supabase Free · estado CANARY y siguiente macrobloque QA · 31/10/2026

- **Canary LIVE certificado**: PR #1226 fusionada; SHA `baee0beee3c52478f64c92049ccf7e97a0096fec`, desplegado en `m26-canary.iberfit.cl` por workflow #41215846674 (SUCCESS). 13/13 workflows del SHA postmerge SUCCESS, incluidos Remote Gate recuperado #41215846606, Device y QA Real Write. PROD no tocada.
- **Candidato actual, NO FUSIONADO**: rama `feat/p0-1209-qa-completed-execution-lossless-20261031`, base Canary exacto anterior. En Cliente A sintético QA-only, completar la carga explícita de historial con secciones `session` y `session_execution` en un solo commit atómico al estado. Nada se consulta al navegar; el histórico descargado ha de mantener dueño, resultado, métricas, revisión, ACK y privacidad. Se amplían pruebas SQL/Playwright y de proyección para probar ambos tipos. Ninguna alteración de base de datos, RLS, cuota o producción en esta fase.
- **No eliminar `results` de ejecuciones completadas** hasta certificar restitución y paridad de Progreso/estadísticas, incluso antes del clic. Una proyección mínima de `id+revision` no es equivalente (0/423 ejecuciones en QA), por tanto no se aplica. El plan Free no está certificado por cuota: sin lectura de Billing uncached GB a través del conector.
- Decisión: mantener #1209 OPEN hasta demostrar Egress real inferior al umbral, no sólo reducción de bytes JSON descomprimidos.

---

## P0 #1209 · Cliente historial completado bajo demanda, fase de contrato (WIP NO DESPLEGADO)

Candidato QA-only `iberfit_client_completed_history_page_free_v1`: no acepta clientId; derives `auth.uid()` y `iberfit_client_id()` server-side, exige rol `cliente`, entorno QA y EXECUTE únicamente para `authenticated`; no emite contenido sin `m43_client_safe_session_v2` / `m43_client_safe_execution_v1`. Páginas ≤32, JSON ≤300 KB, snapshot ≤30 minutos, cursor estable `updated_at + entity_id`, control `expected_count` con fail-closed ante revisiones.

**WIP y sin reducir bootstrap todavía:** la RPC SQL y los tests estáticos solo preparan el contrato; antes de aplicar, integrar la hidratación bajo demanda en Cliente, estados de cargando/reintento/error, la restitución íntegra de historiales, estadística y ejercicios, permisos/IDOR, offline, cuenta nueva, invalidación por ACK, tests reales Coach/Cliente A/B y rollback. No desplegar función, no reducir datos, no fusionar PR hasta certificar el macrobloque vertical entero. Objetivo: evitar ~1,54MB de JSON histórico en la carga inicial del Cliente A QA sin pérdida de historial ni funcionalidad. No es ahorro wire confirmado.

---
## P0 Supabase Free · Proyección segura de ejecuciones legacy QA (CANDIDATO; 31/10/2026)

- SQL de QA `iberfit_bootstrap_v26_rc29()`: para Cliente, la proyección M43 descarta `summary` legacy. En las 421 ejecuciones actuales, `m43_client_safe_execution_v1(to_jsonb(e))` es exactamente igual a `m43_client_safe_execution_v1(jsonb_build_object('id',e.id,'revision',e.revision))` (421/421 comprobadas READ-ONLY). Los inputs pasan de 6.555.697 bytes de JSON total a 25.681 bytes; no inferir directamente ahorro facturable de Egress ni latencia hasta A/B.
- Preparada migración reversible `20261031024500_p0_qa_client_legacy_execution_projection` bajo `supabase/qa-migrations/` con guard QA y hash fuente exacto; rollback bajo `supabase/qa-rollbacks/` con hash de destino exacto. No cambia salida Cliente, Coach/Admin, datos, RLS, sesiones o revisión; el cambio no es PROD y está **NO APLICADO**.
- PR #1220 acumuló Fast Lane, CI, Write, interacción Cliente etc SUCCESS, pero Device Gate (Cliente A tablet Bootstrap 8.411 ms / entorno completo 11.677 ms frente a SLA 10s) y Canary Policy FAIL. No fusionar antes de completar verificación del SHA nuevo.
- La parte pública del PR cachea catálogo en QA-only read-only por 10 minutos y añade manifiesto público; manifiesto observado QA 303 bytes (beneficio marginal). El **siguiente P0** a trabajar es historial canónico Cliente A por demanda con dueño/ACK/rollback íntegro, sin truncar ni borrar historia.
- Organización 7,352/5GB uncached, Egress QA 7,128 GB en capturas, Free aún excedido. Ahorro en cuota NO DEMOSTRADO; medir siguiente ventana comparable. No mutación de Supabase ni PROD en fase de PR.

---

## P0 Supabase Free · QA public payload reuse (candidato pendiente de CI, 30/10/2026)

- Objetivo: reducir llamadas repetidas de catálogo y manifiesto público durante una certificación QA read-only multidispositivo sin saltar permisos ni pruebas de backend. Canary base exacta `d7562b28699e27f97bb4c497a0436ca9517da0ce`.
- Ampliación de memo **solo en el proceso Playwright QA** de 120 s a 600 s, sin persistencia y siempre con primera lectura real por endpoint/parámetros/origen; se incorpora exclusivamente `iberfit_exercise_media_manifest_v1` (RPC anónimo ya autorizado por PostgreSQL) con validación estricta del JSON público; mantiene límites 1 MB y 16 entradas.
- Prohibido cachear JWT, bootstrap, roles, RLS, WebAuthn, Auth, avatares, Storage o escrituras. Otros workflows y aplicación Cliente/Coach/Admin (QA y PROD) no se modifican; ningún SQL, DDL, dataset, secret ni migración.
- Pruebas focales: expiración 10 minutos, 7 contexts, error y cuerpo inválido, manifest público frente a identidad privada y regresión de RPC existente. **No declarar ahorro en GB** sin medir Egress de la organización en ventana comparable.
- Estado: **candidato**; no equivale a merge, Canary LIVE ni PROD. WIP exclusivo #1209. Siguiente paso: CI exacto, auditoría, merge y Canary Exact, luego tasa de Egress.

---

## Stitch privado recuperado · SIGNATURE PR #1213 sigue WIP · 30-10-2026

- Reparación privada `d774edd2cfbac796898aa68384104ccf18e6fe93`; Actions [41141452399](https://github.com/iberfit/Iberfit-platform/actions/runs/41141452399) SUCCESS, Node 22.23.4, 12/12 tests. Exportación original en commit privado `6fb51f85a8285a7677c56372110a3d5910324e80`: HTML, PNG y manifiesto; hashes verificados sobre bytes Git, PNG CRC y píxeles decodificados. Sin transferir secretos ni HTML a este repo público.
- El canvas aprobado es 390×1543; el PNG original es 780×3390. El título interno HTML conserva V2.2 aunque la etiqueta del canvas dice V2.3; se preserva la fuente sin corregirla artificialmente.
- PR #1213 reconciliado localmente con Canary source `b3accc0c93cbece0c33863524754220733217dc0`, sin aplicar sus SQL. Adaptación inicial Cliente: saludo separado de decisión, contexto vertical, tipografía y profundidad del original; mismos comandos y permisos, sin datos DEMO. Coach/Admin mantienen sus composiciones.
- QA local: 573/573 contratos Signature/Cliente, 16/16 navegador de cuerpos reales de tres roles (identidades sintéticas); 10/10 responsive 320/390/834/1024/1440 px dPR2/3 con axe WCAG A/AA. No equivale a autenticación real ni fidelidad visual completa.
- Batería general Windows: 5606 tests, 5548 pass, 57 fallos, 1 skip antes de corregir tres regresiones de composición. Esas regresiones se corrigen sin relajar tests; los otros 54 fallos se reproducen en checkout base sin la adaptación. CI Linux y gates autenticados del HEAD final pendientes. No merge ni despliegue, sin cambios a Supabase/Auth/PROD. Pendiente completar calendario/gráficos y homologación visual de Cliente/Coach/Admin.

## P0 Supabase Free: QA consent bootstrap capped candidate — 2026-10-30
- Canary latest deployed SHA 67299e98892b95427cef0e687d920d2a99a1b808. Decoded Playwright response 290956 bytes of wearable bootstrap; 2630143 bytes in Client main bootstrap. These are not billing bytes.
- QA: 1340 Health Connect consent events for one client, 2026-10-11 through 2026-10-30. Preserving full events and revocation fences in database is non-negotiable.
- Candidate QA-only SQL replacement returns latest 3 consent events by client/provider with same JSON shape, retaining all permissions/invoker RLS and other response fields. Rollback restores full history response; environment guard forbids PROD.
- This SQL is not yet applied or deployed. After pre-merge tests, apply QA only, verify with aggregates, and measure reduction and privacy; do not declare Free quota solved without Usage GB.

---
## P0 #1209 · QA medición de payload por RPC sin solicitudes adicionales · 30-10-2026

- Canary exact `5a7088fb503169816212283ae3f349c9fd01610c` desplegado OK (run #41118749983). El Remote Gate A/B falla por HTTP 401 durante captura visual; restantes flujos post-merge verdes. PROD no tocada.
- Nuevo observador **solo QA** integrado en prueba autenticada existente, sin pruebas extra de navegador: agrupa respuestas reales hasta 3 muestras por endpoint en categorías fijas, sin registrar URLs, IDs, headers, JWT o cuerpos; no crea HTTP. `response.body()` devuelve tamaño observado por Playwright **posiblemente descomprimido** y NO representa GB facturados. Marcador `M26_QA_SUPABASE_PAYLOAD_FOOTPRINT` en logs.
- Objetivo: identificar principales RPC por tamaño medio * frecuencia; priorizar reducciones de payload/frecuencia sin cachear RLS ni saltear Auth/MFA. No interpretar requests o `decodedBytes` como cuota facturada.

---

## P0 #1209 · QA egress: coalescing de RPC públicos solo en tests de lectura · 30-10-2026

- La fuente de tráfico dominante en QA son los navegadores automáticos de GitHub: 22k+ gateway requests/24h HeadlessChrome. El catálogo público registra 2309 llamadas/24h (2076 headless), perfiles públicos 1176 (1036 headless). NO inferir volumen facturado exacto a partir del contador.
- Optimización aditiva sobre PR #1210: respuestas **reales** del catálogo y perfiles públicos de Supabase se reutilizan durante 120 s entre páginas/contexts del **mismo worker de QA read-only**, por origin+RPC+parámetros. Primer request SIEMPRE contra backend real; distinto offset/param recibe su propia respuesta. Exclusivamente apikey pública `Bearer apikey`; jamás sesión de usuario/JWT, bootstrap, datos privados o mutaciones. Suites con escrituras sintéticas tienen el memo desactivado. No altera el funcionamiento en Cliente/Coach/Admin/PROD; no desactiva QA.
- Errores, 401/403, cargas grandes/no-JSON no se cachean; límite 1 MB/16 entradas, sin credenciales en el cache key; expiración + dedupe in-flight; pruebas unitarias específicas.
- **Candidato, NO MERGE ni despliegue hasta gates exact SHA verdes.** Device Gate 5s táctil rojo en PR precedente: bloquear release y corregir aparte sin elevar SLA. Cuantificar resultado real en Dashboard (GB por org y servicio) tras promoción futura.

---

## P0 #1209 · Bootstrap egress - candidata conservadora · 30-10-2026

- Diagnóstico real: candidato cfd731dfe5ef5e266c97fc86113651b875853eed falló pruebas de navegador/Cliente/Coach/Admin por un render diferido que permitía reemplazar rutas después del clic; **revertido ANTES del merge**. No alterar el shell de navegación.
- Nuevo alcance único: eliminar exclusivamente solicitudes `login` idénticas durante la misma carga del mismo owner/lease; las lecturas post-ACK, motivos diferentes y cambio de identidad mantienen la consulta remota autorizada y fail-closed.
- Pruebas específicas: login duplicado antes/durante petición; lecturas post-ACK sin pérdida, mismo motivo no-login repetido, cambio de owner, orden de microtarea y ruta clic sin rAF.
- Este cambio NO basta para resolver 6.96/5 GB Egress; no hacer afirmaciones de reducción hasta comparar bytes en Dashboard con intervalos equivalentes. No tocar SQL, RLS, MFA/WebAuthn, workflows ni límites 10s shell/5s touch.
- PR #1210 abierta; no desplegado. Solo avanzar tras CI, todos los controles browser y Gate remoto GREEN exact-SHA, Canary y promoción segura.

---

## P1 · Reducción conservadora Egress Supabase QA · CANARY DESPLEGADO, PROD PENDIENTE · 30-10-2026

- Evidencia: organización Free con 6,96/5 GB Egress; QA registra ~28k solicitudes gateway/24h, ~22k desde HeadlessChrome. No confundir solicitudes con bytes por servicio.
- Alcance: cachear durante 120 s únicamente catálogo público y perfiles públicos, aislados por origen/versión/pestaña; presupuesto 1,8M caracteres; forzar revalidación para edición del catálogo.
- Nunca cachear bootstrap privado, identidad, JWT, RLS, MFA/WebAuthn, sesión ni contenido de clientes. QA y producción aislados.
- PR #1208 fusionada: SHA 7b991762117f9db444ef2c1a1145efd49a11c6a4, Canary desplegado y certificado en CI/Device; remoto falló 2 veces; PROD sigue 243627058fe58367726c62637613517188617471. Exige CI/QA, revisión de seguridad, Canary exacto, comparación de Egress por servicio y rollback antes de promoción PROD.
- No se elimina ni reduce ningún gate y no se borran evidencias ni datos de QA. La mitigación de catálogo es parcial; evaluar otras rutas si Egress sigue alto.

---

## SIGNATURE P2 · PostHog opt-in anonymous analytics · WIP · 30-10-2026

- Base certificada de Canary y Producción: `2d672f0aa06d451c6e91271da12428c79a8e0d1c` (U51–U56). PR #1200 cerrado y publicación SUCCESS; párrafos WIP antiguos conservados únicamente como historial.
- Candidato único de analítica Cliente/Coach/Admin: captura manual vía API PostHog de `workspace_viewed`, `navigation_requested`, `training_start_requested` (intento, no confirmación), sin SDK de autocaptura, pageviews ni replay. Jamás se incluyen identidad, ID, email, URLs, inputs, salud, IRI o carga de entrenamiento. `distinct_id` aleatorio efímero y sin cookies.
- Consentimiento voluntario en Ajustes/Configuración, desactivado por defecto y revocable. Únicamente PRODUCTION con token público/host de GitHub Actions `vars.IBERFIT_POSTHOG_PROJECT_KEY` y `vars.IBERFIT_POSTHOG_API_HOST`; sin ambos, telemetría apagada. Canary QA no transmite eventos al proyecto de Producción.
- CSP de PostHog solo se amplía en el artefacto PROD cuando configuración completa. Sin backend, Edge, SQL, RLS ni WebAuthn. No afirmar PostHog productivo hasta confirmar configuración, pruebas CI, Canary, promoción y primera ingestión consentida.
- Pendiente: CI exacta del PR, QA, revisión de seguridad/CSP, integración y promoción oficial protegida con rollback. Seguir WIP=1; no comenzar SIGNATURE MASTER VISUAL sobre el mismo HEAD sin certificación.

---

## SIGNATURE U51–U53 · Reconciliación HD premium · WIP · 30-10-2026

- WIP exclusivo PR #1200: reconciliar diseño Cliente/Coach/Admin, evolución confirmada, gráficos SVG nítidos y corrección de `insertBefore` con Canary `d4ff328c1540a3dce2a39c16f6bc454f250abb40`.
- Integración candidata conserva la base de seguridad/WebAuthn, QA, rendimiento, M44 y release posterior de Canary; no se sobrescriben los QA gates con las versiones antiguas del PR.
- Esta revisión NO es merge de Canary, NO es Canary LIVE y NO es PROD. Requiere nueva CI, auditoría, Device, WebAuthn, pruebas autenticadas y visuales sobre SHA de merge candidato.
- Promoción oficial únicamente tras certificación exacta, comparación de capturas reales y rollback. PostHog permanece pendiente hasta cierre del WIP.

---

## SIGNATURE U50 · Rediseño Athletic Editorial / isotipo oficial · WIP · 29-10-2026

- Visual aprobado: verde oscuro, alto contraste, crema/warm gray; sin fondos paisajísticos ni personas decorativas. Isotipo oficial sin recolor y con baja opacidad.
- Candidato U50: rutas Entreno/Evolución/Bienestar reales desde Cliente Hoy; avatar privado M42 real; bandas editoriales Coach/Admin; datos de progreso reales.
- Base comprobada `35edf9e125750f2a7c6c7cbfc430dd7b10603f03`. Rama candidata `feat/signature-u50-athletic-editorial-isotipo-20261029`.
- **NO-GO hasta CI, dispositivo y QA exactos**. U47 one-shot/fixture de escritura reservado debe permanecer intacto. Ni Canary LIVE ni PROD se declaran actualizados por el candidato.

---

## SIGNATURE U48 · Progreso confirmado y recuperación del último paso · 29-10-2026

- PR #1193 fusionada como `dc2aafb897c14f215646d2ccf45145e523835187`, Canary LIVE QA verificado. PROD LIVE sigue `986974b710cce6f7c908e235790a6783ad952d79` y queda intacta.
- Coach real QA run #40860589639: WebAuthn, rutas Coach, sesión U47 visible y reentrada sin `SESION_INICIAR` nuevo; ejecución original `16145839-2e7d-48e2-bf0c-e94325f5c54c` activa **rev2**, `progressSnapshot` persistido, un `EJECUCION_GUARDAR_PROGRESO` aplicado, un lock; fallo de transición a feedback, sin `EJECUCION_COMPLETAR`.
- WIP de recuperación: prueba one-shot acepta exclusivamente revision 1 o rev2 del fixture exacto; rev2 restaura serie confirmada y PROHÍBE volver a registrarla. Espera settlement del controlador, requiere siguiente paso en un toque y ACK separado del checkpoint de feedback, después cierre y readback independiente.
- NO rerun del ensayo de escritura original; no SQL de reparación, sin segundo inicio ni nueva ejecución. NO-GO promoción hasta CI/gates de SHA exacto verdes, U47 completada con lock liberado y readback Cliente/Coach.

---

## SIGNATURE U48 · QA Real Write completo y visual histórico legítimo · 29-10-2026

- PR #1189 en `fix/u48-live-modality-validation`, base protegida Canary `3ae73dd26f5af420420c998a6564d346a99cafd8`. SHA anterior `fc15dee1e9398d5d96a27141118e6b8046ca72ff` comprobado: **QA Real Write Certification 5/5 jobs SUCCESS**, incluido M43 writer con Client B aislado y navegador Cliente con inicio, pausa, reanudación, series, cierre e historial real. Otros gates CI, Fast Lane, audit, Coach WebAuthn, Admin, Session QA, Client authenticated SUCCESS.
- Fallo visual confirmado en cinco viewports: la sesión Cliente A puede estar en estado `empty` (ninguna acción nueva disponible) y conservar historial de entrenamientos completados. `renderCompletedSessionHistory({hideEmpty:true})` renderiza correctamente exclusivamente completados confirmados, sin CTA de iniciar. El antiguo test `toHaveCount(0)` sobre el contenedor de historial es contrario al producto. Revisión: validar filas confirmadas, no iniciar desde histórico ni exponer notas privadas, y permitir ausencia total cuando no existe historial.
- Device Experience y Canary Policy sobre el HEAD anterior dieron FAIL por dependencia de esa misma prueba visual. No se rebajan gates. Reejecutar todos los checks sobre el nuevo SHA antes de merge.
- QA U47 **inalterada** por este cambio: sesión `4d244c01-8966-40f1-8cc7-9e6ec46d1708` en curso rev3, ejecución `16145839-2e7d-48e2-bf0c-e94325f5c54c` activa rev1, exactamente un lock; sin segundo SESION_INICIAR ni ACK de finalización U47. Nada de SQL de reparación directa.
- Condición salida: checks obligatorios SUCCESS en HEAD exacto, integración única `SIGNATURE U48:` solo con runner de primera ejecución, certificación ACK progreso/cierre/readback Cliente+Coach WebAuthn; comprobar Canary LIVE SHA, PROD por runbook separado. No declarar terminado prematuramente.

---

## SIGNATURE U48 · Recuperación segura U47 + validación cardio · WIP 28-10-2026

- **Implementación preparada, NO desplegada:** PR #1189 `fix/u48-live-modality-validation`, HEAD comprobado `8925bab19b2598fda84669d306c7491a0d3386d8` antes del ajuste final de proyección; base Canary `3ae73dd26f5af420420c998a6564d346a99cafd8`. Validador cardio, transporte e intervalos; RPE y requisitos de fuerza intactos.
- **Recuperación cross-device:** GET autenticado contra `session_executions` con filtro exacto de cliente, sesión y ejecución; RLS real; comprobación CAS, autorización de modalidad, prescripción, historial canónico y restauración de resultados previamente confirmados en `progressSnapshot`. No se envía un segundo `SESION_INICIAR`. UI Cliente ofrece «Continuar entrenamiento» sólo con evidencia de ejecución activa única; tests fuerza/running/natación, fraude de identidad y conflictos.
- **Proyección QA estudiada:** `iberfit_m43_client_safe_execution_v1(to_jsonb(session_executions))` elimina deliberadamente cliente/sesión/estado de la colección bruta. `reconcileCanonicalTrainingCollections` restaura esos campos únicamente desde `m26Entities` autorizado. El runner E2E U48 se adapta a esa diferencia sin ampliar bootstrap ni RLS.
- **Gates sobre HEAD anterior `8925bab...`:** 11/12 SUCCESS (CI, Session QA, Fast Lane, WebAuthn, Policy, Device, Audit, Client, Admin, Visual, M44). Único FAIL: QA Real Write M43 `M43_QA_FIXTURE_RECOVERY_UNMARKED_SESSION`, porque U47 conserva lock legítimo del Cliente A. No cancelar U47, no relajar gate ni afirmar GREEN total.
- **DB QA READ ONLY:** sesión `4d244c01-8966-40f1-8cc7-9e6ec46d1708` `en_curso` rev3; ejecución `16145839-2e7d-48e2-bf0c-e94325f5c54c` `activa` rev1; 1 lock, sin `progressSnapshot`. Fixture congelado hasta certificación one-shot.
- **Salida:** evaluar gate M43 temporalmente impedido por fixture; no merge si la política de integración requiere ese gate. Si todos los checks requeridos son conformes, fusionar con SHA protegido y título de integración `SIGNATURE U48:` para habilitar exclusivamente la primera ejecución real en QA. Verificar ACK de progreso/cierre, readback Cliente y Coach, y Canary versión exacta antes de PROD. Nunca usar SQL para simular ACK ni cerrar el lock.

---

## SIGNATURE U48 · Visibilidad resuelta; validación cardio pendiente · 28-10-2026

- PR #1188 integrada: Canary source `3ae73dd26f5af420420c998a6564d346a99cafd8`. Canary Exact Deploy [40779051927](https://github.com/iberfit/iberfit-m26-app/actions/runs/40779051927) SUCCESS: regresión completa, identidad exacta, smoke escritorio/móvil y rollback disponible. CI, auditoría, dispositivos/PWA y evidencia visual SUCCESS sobre ese SHA.
- QA autenticado [40779051887](https://github.com/iberfit/iberfit-m26-app/actions/runs/40779051887), job `123135772414`: el Cliente ya encuentra el running U47 y supera inicio con ACK. Falla después al completar serie: el enhancer público exige `reps/seconds`, ignorando `durationMinutes/distanceKm` que admite el motor. Distancia 6.5 km, duración 35.8 min y RPE 7 no habilitan el botón.
- WIP `fix/u48-live-modality-validation`: validación del formulario acorde con las métricas de cardio, transporte e intervalos; conserva límites, RPE obligatorio y requisitos de fuerza. Regresión del input público y registro por motor real. Implementación candidata, NO desplegada.
- **Estado QA con escritura parcial:** el entrenamiento sintético existente recibió inicio confirmado, pero no se alcanzó ACK de progreso/cierre ni lectura de historial. No repetir el ensayo de inicio ni borrar/resetear ejecución. Antes de nueva certificación, inspeccionar estado canónico y preparar recuperación explícita de esa misma ejecución.
- **PROD no modificada en este bloque. NO-GO de promoción** hasta corregir, superar CI y certificar continuidad/cierre/historial autenticados. Health Connect y Android físico no se recertifican con este trabajo.

---

## SIGNATURE U45 · Primera entrada de campaña sin waterfall · WIP 28-10-2026

- **Base canónica comprobada:** `919b053df6c9ac24b8dc95b98dea90940d6314ce` en Canary y PROD, ambos dominios consultados y QA/PROD identificados correctamente. PR #1181 U44 ya fusionada; no reimplementar.
- **Fricción reproducible en contrato:** el arranque ligero U44 enviaba al módulo completo a un visitante con parámetros ordinarios de adquisición como `?utm_source=instagram`, pese a no existir sesión ni callback de autenticación. Enlaces de entrada de campañas podían recuperar la espera del grafo completo antes del primer acceso.
- **Candidato U45 en rama `fix/signature-u45-campaign-first-action-20261028`, todavía no publicado:** permitir únicamente parámetros de atribución conocidos (incluyendo valores combinados y `prelaunch` de Canary) para mostrar inmediatamente el acceso ligero. **Sesión guardada, OAuth `code/state`, recovery `type/token_hash`, errores Auth, hash, ruta profunda y queries desconocidas siguen cargando la aplicación completa**. Mismo vault, login, WebAuthn, permisos y posterior hidratación. Sin cambios de RLS, SQL, datos, secreto, API ni tracking adicional.
- **Regresión:** matriz determinista de parámetros marketing puros, marketing más callback Auth, entradas desconocidas y persistencia de sesión en `tests/m26_u44_preauth_canary_runtime_contract.test.mjs`.
- **Condición de salida:** CI/contratos + QA visual Chromium/WebKit/Firefox cuando corresponda, PR integrado, Canary SHA exacto, Gates, respaldo M44 y promoción protegida a PROD con smoke real. Este registro no afirma CI, Canary ni producción GREEN.

---

## SIGNATURE U44 · Preauth ligero y módulo real Canary · 28-10-2026

- **Base exacta:** `5757d559a9fdec2c79b55fffc08f673feb3fc3f0`, 6/7 gates SUCCESS y M44 full encrypted PROD DB+Storage/PG17 restore SUCCESS. Canary Exact Deploy #40686362592 FAIL después de desplegar por `document.readyState=complete` no alcanzado en 30s; rollback confirmado a `3ac37e23eefea92fed3f11c99f26f38847423575`. Deploy previo #40672802456 mostraba `M26_BOOTSTRAP_MODULE_TIMEOUT` al cargar todo sin sesión. PROD LIVE sigue `3a74c4f28f6c94f1d3d8b0fc63971c4d7ac65837`, sin SQL PROD.
- **Corrección:** acceso de visitante sin sesión renderizado sin importar todo el grafo Cliente/Coach/Admin. Con sesión persistente, callbacks Auth, recuperación o deep links, mantener hidratación original. Inicio de contraseña utiliza transporte y vault existentes, luego monta app completa y WebAuthn. No se modifican políticas RLS, credenciales, permisos ni datos.
- **Gate fortalecido:** esperar DOM interactivo, formulario funcional y full application module graph realmente importable desde Canary; conservar checks SHA/QA/errores/privacidad/visual móvil+escritorio y rollback. Una pantalla estática sin módulo real no puede ser GREEN.
- **Salida:** PR CI/Device/Policy GREEN, merge exacto, Canary 7/7 y M44 reciente, SQL PROD independiente reversible, Pages producción solo después de comprobar LIVE. Nada en PROD antes de los gates.

---

## SIGNATURE U43 · Release gate coverage + fresh M44 recovery proof · 28-10-2026

- **Base exacta:** `98c3a930926311a67aba19a1e355066d9062c68b` U43 merged Canary source; SQL QA ya aplicada, Cliente A/B/Coach/Admin JSONB exacto y RC64.2B #40665322818 7/7 SUCCESS tras corrección. CI, audit, PROD Data Safety de base success. PROD LIVE sigue C39 `3a74c4f28f6c94f1d3d8b0fc63971c4d7ac65837`.
- **Bloqueo del pipeline identificado:** `scripts/release/verify_source_qa_gates.mjs` requiere el Device Experience Gate SUCCESS sobre SHA exacto. Su `push.paths` excluía las migraciones SQL-only U43; no existía run Device sobre SHA de U43 a pesar de CI/Canary/seguridad. Nunca rebajar el gate ni interpretar un SUCCESS de un SHA antiguo como certificación nueva.
- **Solución protegida:** añadir `supabase/migrations/**` y `supabase/qa-migrations/**` a filtros pull_request/push de Device Gate, con test de cobertura real de ambos eventos y tareas. Modificar exclusivamente un comentario de `m44-encrypted-disaster-recovery.yml` para pedir backup DB+Storage PROD cifrado, restauración aislada PG17 e integridad de objetos con el SHA nuevo. Sin cambiar seguridad ni jobs; QA write y WebAuthn siguen en cola protegida.
- **Alcance hasta certificación:** workflow + tests + documentación; **NO** nuevo SQL aplicado ni despliegue PROD. Exigir 7/7 gates exactos, backup <=2h y rollback para una migración SQL PROD independiente, luego Pages frontend-only protegido y smoke LIVE. No declarar PRODUCCIÓN antes de comprobar identidad LIVE.

---

## SIGNATURE U43 · Bootstrap Cliente/Coach, autorización equivalente y latencia · 28-10-2026

- **Base:** Canary `3ac37e23eefea92fed3f11c99f26f38847423575` exacto QA. Production LIVE `3a74c4f28f6c94f1d3d8b0fc63971c4d7ac65837`. Canary Exact Deploy #40665322832 SUCCESS y WebAuthn Coach/Admin postmerge SUCCESS.
- **Bloqueo:** gate remoto RC64.2B #40665322818 falló dos veces (6/7 passes): primero WebKit mobile, después Firefox; Cliente alcanzó interactividad a 11.0/10.8 s frente al SLA real 10 s. RPC `iberfit_bootstrap_v26` tardó 4.1/8.7 s; no falsificar éxito ni subir timeout.
- **U43 migración QA APLICADA (PROD INTACTA):** `u43_scoped_bootstrap_qa_20261028`, a partir del archivo versionado `supabase/qa-migrations/20261028103000_u43_scoped_bootstrap_qa.sql`; mismo cuerpo optimizado QA/PROD y rollback exacto con guards de entorno. Calcular el scope de Cliente y Coach una sola vez por request; Admin conserva acceso a todos los registros y NULL. Reemplaza sólo 15 comprobaciones por fila en `iberfit_bootstrap_v26_rc29`. No modifica tablas, RLS, WebAuthn, IRI ni publicación. Comprobación SQL post-migración con igualdad JSONB exacta para Cliente A, Cliente B, Coach y Admin; ambos Clientes tienen 0 domainEvents, 0 entidades privadas/report y 0 sesiones no publicadas. 1.899.905 / 4.009 bytes cliente frente a ~20 MB Coach/Admin autorizado.
- **Prueba QA privada hecha:** candidata en `private.iberfit_bootstrap_v26_rc29_scoped_u43_qa()`, sin permisos públicos, coincidencia JSONB **exacta** en QA Cliente A/B, Coach, Admin. Bench puntual: Cliente A 2.42 s → 1.22 s; Coach 9.16 s → 5.72 s. Prototipo previo `private.iberfit_bootstrap_v26_rc29_candidate_qa` fue rechazado por fuga potencial de payload; jamás promoverlo.
- **Salida:** aplicar QA-only tras registrar source; ejecutar comparación y smoke RC64.2B 7/7 más WebAuthn real, CI/Canary. Después evaluar migración separada PRODUCCIÓN con M44 y rollback, sin confundirla con frontend-only C40+U42; promover frontend por pipeline exclusivamente con gates exactos verdes.

---

## WIP único · U42 Canary live smoke navigation · 28-10-2026

- **Base exacta:** Canary source protegido `deabc3fd879f838756994adad8789260261784dd`; QA WebAuthn Coach/Admin, QA Real Write, CI, Device y gates remotos SUCCESS. Canary Exact Deploy [#40658515649](https://github.com/iberfit/iberfit-m26-app/actions/runs/40658515649) FAILURE en el paso Chromium del login read-only.
- **Causa observable:** `page.goto(... waitUntil:'networkidle' ...)` expiró a 45 s antes de validar la UI. Cloudflare había propagado el SHA U42; el rollback Canary restituyó `410a80a5bded459ed26f46d0942b3635c1e01512` y no tocó PROD `3a74c4f28f6c94f1d3d8b0fc63971c4d7ac65837`.
- **Corrección candidata — NO PUBLICADA:** sustituir espera de silencio global de red por DOM listo + documento completo + formulario visible con tiempos acotados. Mantener SHA, QA-only, runtime, avisos, seguridad read-only, errores de página, accesibilidad y prueba desktop/móvil con rollback. Tests dirigidos de red activa y falta de readiness.
- **Salida:** tests y gates de PR, merge protegido a Canary, Exact Deploy nuevo y QA real; únicamente después promoción oficial frontend-only C40+U42+gate si la comparación contra PROD lo permite, con M44 y smoke productivo.

---

## WIP único · Connected360 C39 · Integridad del día civil, fuentes desconocidas y recuperación sin bloqueo · 28-10-2026

- **Producción certificada:** SIGNATURE B38 + Connected360 C38 SHA `f88bd4aff5a71d40a59d23a5c5afa6bc1654fec9`, [promoción oficial #40626067758](https://github.com/iberfit/iberfit-m26-app/actions/runs/40626067758) SUCCESS intento 1. Supabase PROD/QA aislados; sin migración ni despliegue backend.
- **C39 en desarrollo — NO fusionado ni publicado:** historial de Health Connect muestra los últimos siete **días civiles del dispositivo** (no las fechas UTC, que cambian de día a las 21:00 en Chile); normalización rechaza fechas imposibles y revalida filas con forma de snapshot en lugar de confiar en ellas; fuentes nuevas o malformadas aparecen como no disponibles sin bloquear la vista ni insinuar vínculo/permiso certificado.
- **Integridad y límites:** no borrar filas almacenadas, no inferir propiedad del reloj, no modificar consentimiento, autorización, RLS, Auth ni sesiones. QA con prueba explícita `America/Santiago`, fechas inválidas, entradas adversarias y recuperación del Cliente.
- **Salida:** Fast Lane + auditoría integral + CI + Device Experience, merge solo con gates verdes; Canary exacto; PROD exclusivamente por workflow con M44/rollback y SHA live confirmado.

---

## Connected360 C38 · Autorización Android verificada · WIP 27-10-2026

- **Producción verificada:** B36+B37 `b3d7a733ddde8cc192af0143c126f2b64f6524d6`, promoción oficial [#40618977447](https://github.com/iberfit/iberfit-m26-app/actions/runs/40618977447) SUCCESS intento 2, backup M44 nuevo, frontend-only.
- **Canary concurrente:** incluye SIGNATURE B38 de inicio universal de sesiones [#1172](https://github.com/iberfit/iberfit-m26-app/pull/1172) sobre SHA `1238226014052fc2966767beb33d1307174f2ab3`. Connected360 C38 preserva exactamente esos cambios y no sustituye su circuito de certificación.
- **C38 candidato, NO desplegado:** Health Connect ya dispone de invitación granular y autosync al abrir. Corregir que un `health.permissions` solicitado pero no confirmado ocultase la invitación. Solo declarar la elección completada cuando el regreso de Android produce una lectura autorizada o un resultado de permiso confirmado sin observaciones; recuperar tras rechazo, WebView y cambio de cuenta.
- **Seguridad:** no autorizar desde la reanudación, no persistir datos clínicos en eventos DOM, no solicitar permisos background, no interferir con autenticación, sesiones ni IRI. Solo frontend/test/documentación.
- **Salida:** PR, Fast Lane, CI, auditoría, Device Gate, WebAuthn, Canary exacto y promoción si y solo si se completan todas las certificaciones; no confundir código preparado con release productiva.

---

## WIP único · SIGNATURE B38 · Inicio fiable de cualquier entrenamiento · 27-10-2026

- **Base exacta:** Canary source `b3d7a733ddde8cc192af0143c126f2b64f6524d6` (B37 merge #1171); PROD B35 según el último checkpoint documental y pendiente de lectura verificable del `version.json` LIVE.
- **Incidencia real Cliente, P1:** CTA de inicio de running visible pero sin reacción. PROD read-only confirmó servicio y acceso activos, sesión guiada visible/canónica disponible con ejercicio válido y 0 comandos `SESION_INICIAR`. El navegador autenticado concreto todavía no es accesible desde esta conexión; causalidad definitiva pendiente de E2E.
- **B38 preparado para revisión, NO desplegado:** `workflow` y `sessionController` pasan a montaje crítico síncrono antes de declarar la aplicación interactiva; se elimina su montaje tardío progresivo. Un clic durante preparación recibe información explícita (sin intentar ni duplicar escrituras). Un error de entrada también se comunica si la ruta carece de panel de estado. Misma protección transversal para running, fuerza, natación y mixtos; se conservan permisos, autenticación, CAS, confirmaciones y recuperación.
- **Antes de producción:** contratos unitarios, CI, Device Experience autenticado Cliente/Coach, E2E QA real con inicio ACK y cierre, Canary exacto, backup M44 vigente, promoción controlada y smoke LIVE sin modificación de datos reales. El proyecto no se declara corregido en PROD mientras falte esa evidencia. Seguimiento #919 y #1078.

---

## WIP único · SIGNATURE B37 · Navegación táctil sin bloqueo del clic · 27-10-2026

- **Canary B36 realmente servido:** `6384db077a2d3082e72839d4e7cd3bc74990640b` en `m26-canary.iberfit.cl` con Supabase QA; **PROD permanece B35** `3e019c7affe4fb2795edbfa1a562a90c0bc06fd1`.
- **Incidencia P1 [#1170](https://github.com/iberfit/iberfit-m26-app/issues/1170):** Device Gate B36 #40611327053 falló por timeout de `locator.click` durante navegación Cliente a Planificación en móvil y luego tablet apaisada; todos los demás gates, incluidos WebAuthn y QA real write, PASS. No atribuir causalidad definitiva sin perfilado.
- **B37 en desarrollo, NO en Canary ni PROD:** desacopla el cambio de ruta del evento touch que origina el clic; invalida la navegación diferida si cambia la sesión, la ruta o se desmonta el controlador. Mantiene controles de autorización, rutas, foco, UI y la prueba Playwright real de 5 s. Añade diagnósticos sin registrar datos sensibles.
- **Salida:** Fast Lane, CI, Device Experience Gate auténtico en móvil/tablet, Canvas/Canary exactos, los siete gates fuente y promoción frontend-only protegida con M44 y rollback. El P1 permanece bloqueante hasta certificación.

---

## WIP único · SIGNATURE B36 · Cancelación de lecturas obsoletas y CPU de históricos · 27-10-2026

- **Base verificada PROD/Canary:** B35 exacto `3e019c7affe4fb2795edbfa1a562a90c0bc06fd1`; no reimplementar B35.
- **WIP (NO desplegado):** AbortSignal ligado al job de hidratación sin modificar lease de identidad, cancelación de lecturas bootstrap/QA U39 al caducar o cerrar autenticación y reducción de `Date.parse` redundante al validar/ordenar eventos.
- **Alcance:** frontend, tests, seguimiento. Ningún SQL/RLS/Edge/Hosted Auth. Esto NO arregla #1075 (SQL 57014) ni acredita mejora de latencia medida.
- **Antes del cierre:** tests de carreras y abort, WebAuthn Coach/Admin real, CI/Device/Canary SHA exacto, M44 y promoción PROD protegida con rollback. No ocultar historial ni relajar assurance/ACL/timeouts. Connected360 sigue inmediatamente después.

---

## Checkpoint exacto B34 PROD + WIP B35 · 27-10-2026

- **Producción y Canary B34 verificados:** SHA `fee17f54f99d4824e11ccc7cde77c68010bfa0ba`, PROD `pjhmrhejsoofmouedavw`, QA `gjztkdwfmunnzhtvxrsu`. PR [#1167](https://github.com/iberfit/iberfit-m26-app/pull/1167) fusionada, 13/13 gates Canary y [promoción oficial #40592517376](https://github.com/iberfit/iberfit-m26-app/actions/runs/40592517376) SUCCESS intento 1; smoke Chromium, auditoría read-only, Lighthouse, rollback B33.
- **WIP único B35 (NO publicado):** cierre P0 de escrituras tardías tras timeout de login/WebAuthn mediante retiro de la generación opaca de hidratación; nuevos puntos de control antes de pintar/usar catálogo/montar controladores; complejidad lineal en validación de páginas grandes de historial privilegiado QA. Mantener historial completo, roles, RLS, MFA y expiraciones originales.
- **Base del riesgo y evidencia:** QA Coach U39 reconstruye el historial completo y no puede publicar snapshot parcial; el 27-10 20–22 UTC hubo 213 solicitudes de página QA HTTP 200, media upstream 346,6 ms y máximo 5.486 ms. Issue [#1075](https://github.com/iberfit/iberfit-m26-app/issues/1075) sigue abierta para SQL 57014 intermitente; no atribuir automáticamente una causa única. B35 no corrige el plan SQL ni garantiza una mejora de red cuantificada.
- **Frontera de seguridad:** frontend JS, tests y documentación; sin SQL/RLS/Edge/Hosted Auth, sin aumentar timeouts, sin suprimir eventos o registros, sin pasar por alto los gates. B35 requiere PR, Canary exacto y promoción productiva independiente con M44 vigente.

---

## Checkpoint verificado · SIGNATURE B33 EN PRODUCCIÓN · 27-10-2026

- **PROD y Canary exactos:** `72de7224808ed5856b477515b9fb2fab091c6114`. PROD `pjhmrhejsoofmouedavw`, QA `gjztkdwfmunnzhtvxrsu`; `m26/version.json` contrastado directamente en ambos dominios.
- **B33 integrado y certificado:** PR [#1166](https://github.com/iberfit/iberfit-m26-app/pull/1166), postmerge 13/13 `SUCCESS` y [promoción protegida #40579925000](https://github.com/iberfit/iberfit-m26-app/actions/runs/40579925000) `completed/success` intento 1; Chromium productivo 3/3 y auditoría read-only correctos.
- **Producción:** Cloudflare deployment `69976a49-ca2d-42f8-ab9e-1d50cef0df29`, rollback preparado `ddfdfc06-e7e9-4663-a981-0abe0aa1b338` (B32). Frontend-only, 10 archivos modificados, sin cambios SQL/RLS/Auth/Edge.
- **Riesgo en vigilancia:** en el primer intento WebAuthn Coach se observó `M26_SESSION_RECOVERY_TIMEOUT` pese a 62/62 bootstrap HTTP 200; segundo intento pasó. En Admin se observó 503 intermitente en una prueba negativa del catálogo; segundo intento pasó. No declarar causas resueltas solo por reintentos verdes.
- **WIP único siguiente:** SIGNATURE B34, recuperación de sesión abortable y protegida por identidad + navegación Coach de sesiones compacta; pendiente de PR, CI, Canary y producción. La versión B34 no está publicada.

---
## Checkpoint verificado · SIGNATURE B29+B30+B31 LIVE · 2026-10-27

- **PROD y Canary, SHA fuente idéntico:** `405b8668226410398859faa1c5b289951848d0aa`. `app.iberfit.cl/m26/version.json` confirma PRODUCTION/`pjhmrhejsoofmouedavw`, y Canary confirma QA/`gjztkdwfmunnzhtvxrsu`. La separación de entornos se mantiene.
- **PROMOCIÓN REAL certificada:** Production Promotion [#40512134436](https://github.com/iberfit/iberfit-m26-app/actions/runs/40512134436), intento 2 `completed/success`, 27/10 14:21:37 UTC; Lighthouse, Chromium interactivo, auditoría read-only, identidad SHA, Hosted Auth sin cambios y rollback verificados. Release marker `eed6d87a963bb86b1b58e0a77d9f4d037729092b`. Frontend-only, sin SQL/Edge/Auth.
- **Canary completo:** 12/12 workflows `SUCCESS` sobre SHA `405b866...`, incluido Exact Deploy #40506728547, Device Experience, WebAuthn Coach/Admin y Remote Gates autenticados.
- **Recuperación:** M44 DB+Storage PROD cifrado y restauración aislada PG17 certificadas con [run #40274897253 intento 9](https://github.com/iberfit/iberfit-m26-app/actions/runs/40274897253). Primer intento de promoción correctamente bloqueado por `M44_OFFSITE_RUN_TOO_OLD`; reintento aprobado tras renovar la evidencia.
- **Siguiente WIP único:** SIGNATURE B32, mejoras Cliente/Coach/Admin de progresión visual y tarea real, sin tocar backend. Rama `feat/signature-b32-flow-first-20261027` aún no certificada; NO en Canary ni PROD.
- **Problemas independientes abiertos:** #1075 bootstrap QA 57014 intermitente (sin relajar ACL/timeouts), #821 auth/performance, #1064 ocurrencias por fecha (U30–U33 PR Draft sin despliegue).

# IBERFIT · Production State

## Checkpoint operativo vigente · SIGNATURE 360 · 17-10-2026

- **Canary desplegado y certificado:** PR #1019 MERGED; source/merge `a497383896043b86548f7fa5781263e2cc71e3d3`. Los 12/12 workflows postmerge finalizaron SUCCESS, incluido [Canary Exact Deploy #39078154724](https://github.com/iberfit/iberfit-m26-app/actions/runs/39078154724).
- **Identidad real Canary confirmada por el workflow:** `m26-canary.iberfit.cl` sirve el SHA anterior con runtime QA-only `gjztkdwfmunnzhtvxrsu`, pruebas autenticadas desktop/móvil de solo lectura y Cloudflare deployment `bd38c4e3-080c-43f9-a38f-0ad3f9eab8b9`. Rollback conservado a `5826bbd6-0ec4-42ed-9385-9b9aeac0068a` (SHA `069ba68298dd57181a62cc88ce6c31112ac92176`).
- **Producción:** no fue modificada por este bloque. No atribuirle el SHA de Canary; una prueba de bundle PROD no es un despliegue. La aceptación integral de 43 rutas SIGNATURE 360 permanece pendiente.
- **Bloqueos externos:** PR #1017 Auth P0 y PR #1006 SQL QA están Draft. El Production Data Safety Gate verde no acredita recuperación de toda la plataforma ni custodia offsite completa (`platformRecoveryVerified=false`). No promover SQL/PROD desde el carril de UX.
- **Siguiente incremento SIGNATURE:** controles rápidos Coach en entrenamiento táctil de 320 px. Los checkpoints siguientes, anteriores en fecha, son históricos.


## WIP vigente · cierre M39 bloqueado por validación recursiva · 2026-10-13

- LIVE leído en `https://app.iberfit.cl/m26/version.json`: M38 `096c9244089f00f990ca3fba82f3829af8e76c9c`, entorno PRODUCTION, proyecto PROD, `qaOnly=false`. M39 NO está promovido.
- PR #922 fusionado: Canary `4f8b5a6d6debf50dd5faea4abf47c4df360bcbc4`. Exact Deploy `38456939478` SUCCESS; 11/13 workflows postmerge SUCCESS. Coach WebAuthn `38456939395` y Device Experience `38456939296` FAILURE: no promover este SHA.
- Causa demostrada en artifact `11844307619`: `onInvalid -> invalidFormControls -> checkValidity -> invalid` recursivo, `Maximum call stack size exceeded` y bloqueo al abrir Clientes. La observación pasiva de progreso también disparaba eventos `invalid` al llamar `checkValidity`.
- Corrección en `fix/m39-validation-recursion-closure`: leer `ValidityState.valid` sin emitir eventos; conservar validación nativa de envío y restricciones. Regresión de navegador añadida a Device Experience (formularios incompletos, rango inválido, envío válido y navegación), más pruebas unitarias.
- Device Experience falló además esperando el CTA WebAuthn mientras la UI seguía «Confirmando identidad y permisos». Esa causa no está demostrada aún; requiere revalidación y diagnóstico, sin ampliar timeouts ni omitir MFA.
- Siguiente: CI del cierre, merge protegido, certificación Canary exacta y promoción oficial con verificación LIVE/rollback. La aceptación de running por el usuario sigue pendiente (#919).

## Canary certificado · cierre PR #869 · 2026-10-11

- [PR #869](https://github.com/iberfit/iberfit-m26-app/pull/869) MERGED. SHA exacto protegido **`053fc83df22062c636149a92a9f6386200928fea`**; 7/7 gates previos y **12/12 postmerge SUCCESS**. La carrera de hidratación entre sesiones (cuenta A → B, relogin misma identidad, refresh legítimo, error tardío y coalescing) queda protegida mediante lease opaco por generación y regresiones reales node:vm.
- [Canary Exact Deploy 38152029358](https://github.com/iberfit/iberfit-m26-app/actions/runs/38152029358) **SUCCESS**, desktop/móvil autenticado read-only, runtime aislado QA `gjztkdwfmunnzhtvxrsu`, deployment Cloudflare `12ed932d-e2c1-4b0d-b43d-474b6fe240c6`; rollback certificado a deployment anterior `060289ae-649b-456c-8712-def4a4c96fa4` (SHA `1887dc01fa0315d5a8330022b5b5d6aaef018c08`). **No es una promoción PROD.**
- Issue [#821](https://github.com/iberfit/iberfit-m26-app/issues/821) mantiene abierto el histórico timeout assurance Firefox/tablet x6 aún sin causa raíz cierta: no confundir la carrera ya corregida con su explicación. Tests repetidos y recovery siguen obligatorios antes de cerrar la incidencia.
- **Metodología aprobada para próximos trabajos:** macrobloques integrados end-to-end, rama/PR principal por objetivo coherente, tests dirigidos antes de un CI consolidado, Canary SHA exacto y release PROD independiente. Seguridad/RLS/rollback nunca se omiten. Política canónica en `AGENTS.md` y `docs/CHATGPT_WORKFLOW.md`.
- **WIP vigente:** Connected 360 V45 en PR #870 **DRAFT** `feat/connected360-v45-integrated-macro-20261011` (base `053fc83d…`). El escritor **explícito y transaccional V45+V44 ya existe únicamente en Supabase QA**; validación autenticada con dos cuentas sintéticas, aislamiento, replay sin cambios, revocación/borrado y siete gates PR completados SUCCESS en el SHA `ee73de9289a26c6c1ada124a867e2e7d5bb98140`. **NO** hay sincronización automática de reloj certificada, E2E físico Android/iPhone ni despliegue de este PR a Canary o PROD en este checkpoint. PROD V45 sigue ausente; `productionAllowed=false`.

## Certificación Canary PR #867 · 2026-10-11

- PR [#867](https://github.com/iberfit/iberfit-m26-app/pull/867) MERGED; Canary SHA `f931ed39f176a7d43eff2802f5d7913ab5d07e50`. Tras los ocho checks anteriores, los cuatro pendientes también finalizaron **SUCCESS en intento 1**: Exact Deploy [38148016115](https://github.com/iberfit/iberfit-m26-app/actions/runs/38148016115), Hosted Auth Security QA [38148016030](https://github.com/iberfit/iberfit-m26-app/actions/runs/38148016030), Device Experience [38148015964](https://github.com/iberfit/iberfit-m26-app/actions/runs/38148015964) y Remote Read-only [38148016027](https://github.com/iberfit/iberfit-m26-app/actions/runs/38148016027). **12/12 postmerge SUCCESS**.
- Despliegue Canary exacto: Cloudflare deployment `ce37fbf1-c701-4ec7-8c36-21ecf89e8577`, proyecto `iberfit-m26-canary`, SHA servido verificado, QA Supabase `gjztkdwfmunnzhtvxrsu` sin referencias a Supabase PROD, desktop/móvil autenticado read-only GREEN. Rollback anterior `987afaea-0515-4849-afe8-ffd4a43f2afb`; artifact `11706031347`. **NO afirmar promoción o SHA LIVE PROD** a partir de este workflow.
- Issue [#821](https://github.com/iberfit/iberfit-m26-app/issues/821) permanece OPEN: refresh obsoleto y 401 de otra generación corregidos por #867, pero el timeout assurance original Firefox/tablet x6 sigue sin root cause probado. La siguiente rama trabaja únicamente en diagnóstico seguro del clic/bootstrap/assurance y debe superar CI; no está fusionada.


## Checkpoint verificado · Connected 360 · 2026-10-11

- **Canary fuente del merge #859:** `b2371fd7c9857b4d035ae2bdeaeb75fcd5d69dd0`; PR #859 merged. Cambios: abort/generación de lectura foreground, aislamiento al cambiar Cliente/sesión, control después de awaits, recuperación ante logout, hidden, offline y pagehide. Los seis gates del PR sobre su HEAD `40a8dd02c17763713d710adcb456e1f542ce514a` terminaron SUCCESS.
- **Canary desplegado:** run Exact Deploy `38113954119` SUCCESS, dominio `m26-canary.iberfit.cl` con SHA y Supabase QA `gjztkdwfmunnzhtvxrsu` certificados, desktop/móvil autenticado read-only GREEN, deployment `1ad497e9-4499-4046-a2f0-86aec86bdabf`, rollback preservado `658abaa1-5c7b-46f1-81bc-14fdd1391c57`. No tocó producción.
- **Canary actual certificado #861:** SHA `bffa8ec1a54245141338d0b7282033ffedee49f8`, PR #861 merged; Canary Exact Deploy run `38114835821` SUCCESS, CI/Audit/WebAuthn/remote gates SUCCESS. APK Android QA del push de ese SHA: run `38114835828` SUCCESS, artifact `11692568538` aislado (`cl.iberfit.m26.qa`, DEBUG, sin ingest). No confundir build con prueba física.
- **PR #863 certificado en Canary:** merge SHA `f0063d76a770ff92b2fe489bd847e0ca1749f155`, Exact Deploy `38117437616` SUCCESS, deployment `185bc4bd-6727-4ef8-915a-91977af92d6f`, rollback `965883e3-a11c-47da-bbc7-8ea7fa4ed3c9`, Android DEBUG QA push `38117437627` SUCCESS artifact `11694456300`; Device Experience, Auth y gates remotos SUCCESS. Protege revocar/borrar/logout durante una autorización o importación. No certificado en dispositivo físico ni PROD.
- **Canary vigente certificado #864:** PR #864 MERGED, SHA `3c50b9cad1345bba097a7fb86876dafa1b47387e`, Exact Deploy `38142899178` SUCCESS, Android DEBUG QA push `38142899147` SUCCESS artifact `11703577114`, CI, Audit, Device Experience, Auth Coach/Admin, remote gates y bundle/frontend todos SUCCESS. Vuelve a verificar el grant después del preflight V45 antes del RPC V44, impide leer Health Connect desde una sesión sustituida durante refresh de token. Los test de revocación/rotación/identidad pasaron. No habilita writer V45 ni sincronización automática.
- **Supabase QA V45:** `public.m26_wearable_source_daily_v45` existente, RLS ON/FORCE, ninguna política de lectura directa, sin permisos directos para `authenticated`, trigger de INSERT/UPDATE bloqueado, `automatic_sync_certified=false` obligatorio; validador de previsualización retorna `persisted:false`. Backend automático V45 todavía NO certificado.
- **Supabase PROD:** `public.m26_wearable_source_daily_v45` ausente al chequeo; no aplicar migraciones ni habilitar escrituras de salud por promoción frontend. Los enlaces Health Connect/HealthKit mantienen `productionAllowed=false`; Android actual permite solo preview DEBUG local, y Apple requiere compilación firmada y E2E físico.
- **Pendiente real:** prueba física de la APK QA Android en Health Connect, iOS HealthKit firmado, autorización y writer V45 transaccional (hoy cerrado), pruebas multidispositivo, E2E y controles antes de lanzamiento PROD. Cliente real `juancarlosjimenez54` únicamente tras certificación, nunca para experimentar.


## Incidencia P1 Auth #821 · paridad QA cerrada, causa de timeout abierta · 2026-10-11

- PR #831 MERGED desde 2026-10-10; el broker QA `iberfit-qa-webauthn-cert-broker` seguía v12 y clasificaba cualquier error PGRST303 de `user_profiles` como incompatibilidad de rol 409. Se comparó el código de runtime y repositorio: idéntico fuera de `validateTarget()`; import map y autenticación GitHub OIDC sin diferencias.
- **Despliegue acotado solo QA:** broker ahora **v13 ACTIVE**, digest `b27512055e3a3a33e0d63e0862444f53904b610d1f31d2f398fe33edcbfc9417`, lectura posterior del código desplegado **exactamente igual** al blob del repositorio `fa4bacf8014101e6aef75a194aaef9708d357a63`; `verify_jwt=false` preservado porque la función exige y valida JWT OIDC GitHub por sí misma. Clasifica fallos de lectura en Auth/perfil/membership/asignaciones/roles como **502**, frente a incoherencias reales **409**. Sin cambios PROD ni esquemas.
- **Validación real tras v13:** Coach WebAuthn recurring #38142899129, segundo intento, PASS en contrato, E2E QA y gate; Admin WebAuthn #38142899200 segundo intento, PASS en contrato, E2E QA y gate.
- **Evidencia read-only Supabase QA 10/10 13:35Z–11/10 13:35Z:** perfil `200 × 223`, `401 × 1` a 2026-10-10 14:39:44.470Z; nuevas lecturas 200 segundos después. En esa ventana, token `200 × 2632`, assurance `200 × 2517`. El JWT del 401 no tiene metadata de expiración parseada: no asumir credencial expirada ni causalidad de timeout. No se consultaron datos personales/tokens.
- **Pendiente P1:** #821 permanece OPEN; investigar race formulario/bootstrap/handoff y ausencia intermitente de assurance con la matriz tablet landscape CPU x6, Firefox, sesiones y red variable. No resolver aumentando arbitrariamente timeout ni debilitando WebAuthn. Evidencia y checkpoint añadidos al issue #821.

## Archivo histórico · perfiles de medición por ejercicio · 2026-10-08
- **Nota de vigencia 2026-10-11:** PR #803 ya MERGED en Canary (merge `43c5352ff9e48dcd7b1cf7451c4e3dd2938ca6ce`). Los siguientes puntos son un snapshot de 2026-10-08, no el estado operativo actual; el despliegue exacto LIVE de este bloque no se verificó aquí.

- **PR #803:** `feat/exercise-measurement-profiles-admin-20261008` contra `canary/rc74-4`. El frontend del nuevo motor está **fuera de Canary/LIVE** hasta fusionar y certificar el SHA de release. Último head inspeccionado al iniciar la reconciliación: `9cb0c203b4a5a95021c80bfaa140f4e55df3ae50`. No confundir presencia del esquema en PROD con despliegue del producto.
- **Supabase PROD:** migraciones `20261008132342_exercise_measurement_profiles_admin_v1` y `20261008132350_exercise_measurement_profiles_high_confidence_v1` ya registradas; 26 perfiles, 0 ediciones auditadas. **No reaplicar**.
- **Supabase QA:** migraciones `20261008130318`, `20261008130642` y ajuste de pertenencia activa `20261008130922` registradas; 25 perfiles, 0 ediciones auditadas. El identificador `IBF-PLANCHA-LATERAL-APOYO-BANCO` está presente en PROD, no en el catálogo QA.
- **Seguridad observada en ambas bases:** RLS activo para perfiles y auditoría; sin SELECT/INSERT de `anon` o `authenticated` sobre tablas; RPC de lectura disponible para `anon/authenticated`, RPC de escritura solo ejecutable por `authenticated` y con verificación interna de Admin activo + CAS + auditoría. Definiciones de ambas RPC iguales entre QA/PROD (hash verificado).
- **CI candidato inspeccionado:** 10 de 11 workflows SUCCESS, `Session QA isolated/browser-live-workout` aún en ejecución durante la inspección. El job se encontraba instalando dependencias de navegador. Reconsultar y exigir CI sobre SHA final; los estados son temporales.
- **Concurrencia:** Canary llevaba cuatro commits exclusivos respecto al head PR, relacionados con lotes aprobados de imágenes. Nunca sobrescribirlos ni hacer force push; GitHub debe integrar mediante merge seguro y reevaluar gates.
- **Aceptación pendiente del release:** ejecución real en Coach de Carrera suave (5 km / 30 min / 06:00 / RPE), plancha, intervalos, ciclismo y transporte; persistencia de valores observados, correcciones, reutilización de plantillas, permisos por rol, responsive y smoke Canary y LIVE. No marcar completado sin verificación de artefacto desplegado.
- **Siguiente macro-WIP tras release:** crecimiento gobernado del catálogo deportivo (carrera continua/series/fartlek/trail, ciclismo carretera/MTB/rodillo, etc.), previa deduplicación y perfiles explícitos.


Última actualización documental: 2026-10-08
Estado: fuente de verdad operativa para LIVE, Canary y Auth.


## Checkpoint vigente · Coach Operativo 360 · Comparación de cierre en producción · 2026-10-08

- **Canary y LIVE:** source funcional `f25201d5847b2aa66e9d6ae04736b73f4f400764`, merge PR #799. Sus 13/13 workflows post-merge terminaron SUCCESS (Canary Exact Deploy `37773112217`, Device Experience, QA Real Write, Auth Coach/Admin, CI, gates remotos).
- **Promoción PROD:** run `37774677595` SUCCESS con 31/31 pasos. Release `release/prod-f25201d5847b`, manifest `5895bec90dc48903cd38052a7fa468ad851a0ccf`.
- **Deployment Cloudflare Pages LIVE:** `7adc9f72-87d9-4746-9531-f200efaa2b85` (`https://7adc9f72.iberfit-m26-production.pages.dev`). Rollback reservado `6a6eabef-c3fc-41ca-b4c0-846eea6d8c22` (source anterior `ade3de994e2e32f086bdc163d204599fb0a0a39b`); rollback no ejecutado.
- El workflow verificó `app.iberfit.cl`, runtime de Supabase PROD, login/Chromium desktop/tablet/móvil, auditoría de solo lectura e identidad exacta.
- **Disponible en LIVE:** comparación Coach del plan original y el resultado confirmado, por ocurrencia de ejercicio, sustituciones, omisiones expresas, series adicionales y datos ausentes. Localización ES/EN/FR/PT.
- **Siguiente macro-WIP fuera de LIVE:** PR #800, `feat/coach-planning-context-reliability-360-20261008`, protege la selección del ciclo actual, procedencia de la duración y edición por grupo. Se considera terminado únicamente tras CI, merge, Canary exacto y promoción LIVE independiente.

## Checkpoint histórico · Coach Operativo 360 · Cierre y feedback fiable · 2026-10-08

- **LIVE y Canary:** `ade3de994e2e32f086bdc163d204599fb0a0a39b`, merge PR #798; 12/12 workflows posteriores SUCCESS, incluidos QA Real Write, Device Experience, Auth y Canary Exact Deploy.
- **Production Promotion:** run `37770746465` SUCCESS (31 pasos), rama `release/prod-ade3de994e2e`, manifiesto `a62f68939af72d6528e6f8e944616da9073e990b`. Runtime PROD, Chromium, Lighthouse, seguridad, auditoría read-only y rollback comprobados; rollback no ejecutado.
- **Deployment Cloudflare PROD exacto:** `6a6eabef-c3fc-41ca-b4c0-846eea6d8c22` (https://6a6eabef.iberfit-m26-production.pages.dev). **Rollback reservado:** `0e540a4e-b16a-4980-b17c-b6a862f5d878`, source anterior `56c485fcfa5c3f331161748111df94f4a74d4cc1`.
- Mejoras LIVE: objetivo RPE/RIR opcional sin coerción engañosa; feedback final visible con texto escapado, molestias triestado, orientación profesional basada en señales, bloqueo de acción de seguimiento hasta sincronización confirmada.
- **WIP todavía fuera de LIVE:** <PR #799> `feat/coach-completion-evidence-360-20261008`: comparar snapshot histórico de prescripción con series realizadas, omitidas y extras por ocurrencia. No considerar integrado antes de tests, merge protegido, Canary exacto y promoción separada.



## Checkpoint histórico · Coach 360 · Preparación y continuidad · 2026-10-08

- LIVE y Canary: `56c485fcfa5c3f331161748111df94f4a74d4cc1` (PR #797 integrado).
- Canary Exact Deploy `37727148903` SUCCESS, Device Experience `37727148923` SUCCESS y 12/12 workflows posteriores correctos.
- Production Promotion `37728220397` SUCCESS, release `release/prod-56c485fcfa5c`, manifest `296b25f811dcfed19c43767873edbebf4d90683e`; 31 pasos correctos.
- Deployment PROD exacto `0e540a4e-b16a-4980-b17c-b6a862f5d878` (`https://0e540a4e.iberfit-m26-production.pages.dev`). Rollback reservado `9bac834a-f0b2-4796-9237-1fa2a62c4c68` (source previo `d2ab5a4f405ce6e6ace128c593bd37973b9b53b8`). Rollback no ejecutado.
- Verificación LIVE del workflow: app.iberfit.cl, runtime de Supabase PROD, Chromium interactivo, Auth y auditoría read-only.
- Este bloque de preparación es histórico: PR #798 cerró posteriormente el feedback y ya se encuentra publicado, según el checkpoint vigente.

## Checkpoint histórico · Coach 360 · Contexto sesión/cita · 2026-10-08

- **LIVE y Canary certificados en source** `d2ab5a4f405ce6e6ace128c593bd37973b9b53b8`, merge PR #796 desde `feat/coach-operativo-360-session-context`. El SHA de Canary se validó explícitamente.
- **Canary Exact Deploy** run `37724506133`: SUCCESS, validaciones autenticadas read-only y superficie exacta. **Device Experience Gate** run `37724506170`, intento 2: SUCCESS; en el primer intento falló la entrada Client Genie en tablet, el rerun del mismo SHA pasó. Los 13 workflows post-merge acabaron GREEN.
- **Production Promotion** run `37726210527`: SUCCESS. Rama de release `release/prod-d2ab5a4f405c`, manifest commit `010f52fbf28cc67c59c2de461233a2530417a9af`, source `d2ab5a4f405ce6e6ace128c593bd37973b9b53b8`. Preflight, regresión, Lighthouse, Hosted Auth, runtime PROD, identidad exacta de `app.iberfit.cl`, Chromium interactivo, auditoría read-only y evidencia de rollback GREEN. No se requirió rollback.
- **Deployment PROD exacto:** `9bac834a-f0b2-4796-9237-1fa2a62c4c68` (`https://9bac834a.iberfit-m26-production.pages.dev`). **Deployment anterior para rollback:** `8e1c0c01-4a6f-4cf4-9947-23f5520721aa` (source `366feb554c7922e06e4e124094e4bae043ae1efe`). Datos registrados por el workflow de promoción, no inferidos de previews.
- Producto: arranque con sesión exacta de cita, alias/estados confirmados, citas en curso, último feedback por cierre canónico y bloqueo de sesión incompatible. Sin nueva fuente de verdad ni migraciones de esquema/RLS.
- Macro-WIP Coach funcional continúa: adaptar sesión preparada con copia independiente y guardas de publicación, PR #797; las mejoras del constructor, ejecución y cierre siguen el recorrido existente. Media Factory permanece en otro hilo.
- Los checkpoints históricos inferiores no prevalecen sobre este SHA ni sobre la evidencia de Actions/Pages.


## Checkpoint histórico · Coach Operativo 360 — Continuidad y Fiabilidad · 2026-10-08

- Canary revalidado en `366feb554c7922e06e4e124094e4bae043ae1efe`, merge PR #795. No había PR abiertos al iniciar el siguiente bloque.
- Última promoción observada: Production Promotion `37722367430`, **SUCCESS**, release `release/prod-366feb554c79`, manifest commit `5736084c26f9a91da432add806f56fe60837f32e`.
- El job `113132731185` confirma identidad/runtime `app.iberfit.cl`, Chromium interactivo, auditoría read-only y registro de rollback. Rollback no ejecutado. Esta es evidencia del workflow productivo, no una nueva certificación autenticada desde el entorno local.
- Deployment certificado en el checkpoint de promoción: `8e1c0c01-4a6f-4cf4-9947-23f5520721aa`; rollback `9386bd59-9519-4959-8217-e5cbb415b2de`, source anterior `bb9f2f56810e83a908257651aa19b5f69f4efe1a`.
- PR #795 está cerrado en PROD: borradores/checkpoints asociados a su propietario, confirmación UI aislada, inicio y salida serializados. Sin cambios de esquema, RLS ni Command Bus.
- Los checkpoints inferiores son históricos y no sustituyen esta promoción.

### WIP histórico certificado · Experiencia funcional Coach · Contexto de cita a ejecución

- Base exacta `366feb554c7922e06e4e124094e4bae043ae1efe`; rama `feat/coach-operativo-360-session-context`.
- Implementado: CTA principal vinculado a la sesión preparada, bloqueo si la preparación no permite inicio, cita en curso conservada hasta su fin registrado, estados/aliases de agenda normalizados en arranque y último feedback ordenado por cierre canónico.
- Validación local: 72 pruebas focales PASS; regresión offline 3.598 PASS, 1 SKIP, 0 FAIL. Nueve regresiones nuevas con datos sintéticos, sin mutaciones remotas.
- Cobertura de navegador añadida a la matriz existente de Coach: click/touch/teclado hasta el evento real del workflow, verificando sesión y cliente exactos. Ejecución pendiente.
- Estado en aquel checkpoint: pendiente de CI; posteriormente el PR #796 quedó certificado en PROD, según los checkpoints superiores.
- Siguiente paso: certificar el tramo de contexto y continuar el macro-bloque funcional sobre las superficies existentes; Media Factory queda fuera.

## Checkpoint histórico · Interaction Reliability + Security/Data Integrity 360 · 2026-10-05

- PROD y Canary comparten como source funcional certificado el merge SHA `70dfbdc5cd3e87536338dc302d7da5f2547bba0a` de PR #730.
- PR #729 cerró Interaction Reliability 360: autofill/focus/caret/select, scroll frente a teclado/safe areas, overlays/touch y matrices desktop/tablet/móvil sin degradar Auth.
- PR #729 merge `744fe36112ff1c61e3b61772f3c74943edee08f2`: Canary Exact Deploy #172 run `37341609208` SUCCESS; Device Experience, Admin/Coach WebAuthn, Client Interaction, Admin Matrix, Remote Gates y evidencia visual GREEN.
- PR #730 cerró Security/Data Integrity 360: auditoría por intención de SECURITY DEFINER, RLS/Data API e índices FK; hardening ACL legacy mínimo y no destructivo.
- PR #730 merge `70dfbdc5cd3e87536338dc302d7da5f2547bba0a`: Canary Exact Deploy #173 run `37344540138` SUCCESS y Remote Gates #667 run `37344540094` SUCCESS; CI, QA Real Write, Data Safety, Continuous Audit, Admin/Coach WebAuthn y Final Frontend/Bundle también GREEN.
- PROD: migración `20261005173632_security_backend_acl_hardening_v1` aplicada. El trigger de activación en `auth.users` permanece habilitado; ejecución directa del trigger helper y de tres RPC legacy de invitación quedó revocada; RPC Admin canónicas permanecen ejecutables.
- Advisor PROD tras hardening: SECURITY DEFINER authenticated baja de 55 a 52; se mantienen 2 anon deliberados de catálogo/media; leaked-password sigue condicionado al plan disponible.
- Production Promotion #316, run `37349796344`: SUCCESS. Verificó source exacto, regresión, Lighthouse, Hosted Auth, preview, deploy Cloudflare, identidad/runtime LIVE, Chromium interactivo, auditoría integral read-only y evidencia de rollback; rollback no fue necesario.
- Deployment PROD exacto: `75ab5fa1-eb8a-4069-ab65-ddbc3649285b` (`https://75ab5fa1.iberfit-m26-production.pages.dev`). Rollback reservado: `14486b12-8e68-47de-8212-921573328ff4`, source anterior `56421d74fa52b08a949c34ef6c016162882d217b`.
- UX guiada #728 continúa vigente: dato confirmado puede proponerse; dato desconocido permanece vacío; autocompletar nunca equivale a confirmar; una edición humana prevalece.
- Persistencia operativa canónica continúa en `training_cycles`, `sessions`, `session_executions`; mutaciones por Command Bus.
- Ruleset `Protect Canary`: enforcement activo, PR obligatorio y required checks estrictos `validate` + `canary-policy-gate`.

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
- Source SHA LIVE certificado: `70dfbdc5cd3e87536338dc302d7da5f2547bba0a`.
- Runtime: PRODUCTION, Supabase PROD `pjhmrhejsoofmouedavw`, QA desactivado.
- Release branch: `release/prod-70dfbdc5cd3e`; manifest commit `60cd9ac1db2472963b3b8e034ab28900140de6fb`.
- Production Promotion #316, run `37349796344 = SUCCESS`.
- El workflow verificó Hosted Auth, source/runtime exactos con 3/3 lecturas estables, entrada Chromium interactiva y auditoría integral read-only; rollback automático quedó disponible y no fue necesario.
- Deployment exacto LIVE: `75ab5fa1-eb8a-4069-ab65-ddbc3649285b`; rollback: `14486b12-8e68-47de-8212-921573328ff4` al source `56421d74fa52b08a949c34ef6c016162882d217b`.
- Entrenamiento Operativo 360, Experiencia Guiada 360, UX/Autocompletado Global 360, Interaction Reliability 360 y Security/Data Integrity 360 están publicados.
- No considerar cambios posteriores en PROD sin una nueva promoción exacta y verificación LIVE.

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
- Source funcional certificado: `70dfbdc5cd3e87536338dc302d7da5f2547bba0a`.
- PR #729: Canary Exact Deploy #172 run `37341609208` SUCCESS sobre `744fe361...`.
- PR #730: Canary Exact Deploy #173 run `37344540138` SUCCESS y Remote Gates #667 run `37344540094` SUCCESS sobre `70dfbdc5...`.
- CI #3498, Continuous Audit #3026, QA Real Write #782, Production Data Safety #426 y Admin/Coach WebAuthn post-merge terminaron SUCCESS sobre el merge #730.
- Ruleset `Protect Canary` activo con PR y required checks estrictos.
- P0 funcional demostrado: 0 en la ronda actual.

## Canary certificado histórico · Retos

- Rama: `canary/rc74-4`
- Source certificado: `be39ea321cd5b476066381f64e88c5ecdf78a5a7`
- Merges de este lote: PR #631 y #658.
- [Canary Exact Deploy 36791028304](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791028304): SUCCESS, deployment `17fb6d68-7ee8-4aaf-9674-66ea513ae931`, identidad exacta y smoke LIVE desktop/móvil.
- [Gate remoto 36791028388](https://github.com/iberfit/iberfit-m26-app/actions/runs/36791028388): SUCCESS, auth read-only, 7 pruebas de smoke, recuperación sin freeze y 4 pruebas visuales autenticadas.
- CI, Continuous Audit, Hosted Auth Security QA y Admin/Coach WebAuthn: SUCCESS sobre el mismo SHA. Device Experience pasó sobre `09733a94e973eb61e8f3b655422e7f2fc95b8418`; #658 sólo cambió helper del gate y sus tests, sin delta src/public/qa/supabase.
- El HEAD de trabajo puede avanzar por documentación; no confundirlo con el source LIVE certificado.
- P0 funcional demostrado: 0 en las rondas certificadas actuales.
- Gobernanza Canary: la protección clásica no refleja toda la política; el ruleset `Protect Canary` (id `23254113`) está activo sobre `canary/rc74-4`, bloquea deletion/non-fast-forward, exige PR y required checks estrictos `validate` + `canary-policy-gate`. No tratarlo como P1 abierta.

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
- WebAuthn privilegiado: fail-closed; Admin/Coach recurrentes reales certificados sobre el source actual.
- Los dos SECURITY DEFINER anon revisados corresponden a lectura pública intencional de catálogo/media.
- SECURITY DEFINER authenticated auditados por intención; PROD queda en 52 tras retirar 3 grants legacy de invitación. Helpers privados/runtime canónicos conservan sólo el acceso necesario.
- 0 tablas `public` sin RLS. Las tablas RLS con 0 policies tienen 0 grants para `anon/authenticated`, deliberadamente fuera de Data API.
- FKs sin índice evaluadas contra cardinalidad, uso real y EXPLAIN; no se añadieron índices sin beneficio demostrado.
- RPC Admin críticos revisados exigen privileged assurance, Admin, organización y scope.
- Leaked-password protection continúa condicionado al plan Supabase disponible; Promotion #316 lo evaluó sin forzar upgrade.

## Pendientes históricos del 17/09 (requieren revalidación)

### P0

Ninguno demostrado en el Canary actual.

### P1

1. RESUELTO 2026-10-05: Admin autenticado QA real cubierto por matrices desktop/tablet/móvil + WebAuthn recurrente.
2. E2E positivo Admin de invitación/reenvío y alta/edición/baja controlada.
3. Sesión Coach real por dispositivo sin freezes y recuperación de error.
4. RESUELTO 2026-10-05: auditoría SECURITY DEFINER/RLS/índices por intención cerrada en PR #730 y promovida a PROD.
5. RESUELTO 2026-10-05: Canary protegido por ruleset `Protect Canary`, enforcement activo y required checks estrictos `validate` + `canary-policy-gate`.
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
