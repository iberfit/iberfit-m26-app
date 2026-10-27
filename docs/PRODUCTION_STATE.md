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
