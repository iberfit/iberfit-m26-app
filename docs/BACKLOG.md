## Connected360 C38 · Autorización Android verificada · WIP 27-10-2026

- **Producción verificada:** B36+B37 `b3d7a733ddde8cc192af0143c126f2b64f6524d6`, promoción oficial [#40618977447](https://github.com/iberfit/iberfit-m26-app/actions/runs/40618977447) SUCCESS intento 2, backup M44 nuevo, frontend-only.
- **Canary concurrente:** incluye SIGNATURE B38 de inicio universal de sesiones [#1172](https://github.com/iberfit/iberfit-m26-app/pull/1172) sobre SHA `1238226014052fc2966767beb33d1307174f2ab3`. Connected360 C38 preserva exactamente esos cambios y no sustituye su circuito de certificación.
- **C38 candidato, NO desplegado:** Health Connect ya dispone de invitación granular y autosync al abrir. Corregir que un `health.permissions` solicitado pero no confirmado ocultase la invitación. Solo declarar la elección completada cuando el regreso de Android produce una lectura autorizada o un resultado de permiso confirmado sin observaciones; recuperar tras rechazo, WebView y cambio de cuenta.
- **Seguridad:** no autorizar desde la reanudación, no persistir datos clínicos en eventos DOM, no solicitar permisos background, no interferir con autenticación, sesiones ni IRI. Solo frontend/test/documentación.
- **Salida:** PR, Fast Lane, CI, auditoría, Device Gate, WebAuthn, Canary exacto y promoción si y solo si se completan todas las certificaciones; no confundir código preparado con release productiva.

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

## WIP único · SIGNATURE B35 · Hidratación segura de Coach con historial amplio · 27-10-2026

- **Base PROD/Canary:** B34 `fee17f54f99d4824e11ccc7cde77c68010bfa0ba`, release #40592517376 SUCCESS.
- **Entrega B35 en curso:** al agotar el plazo o fallar el setup autenticado se retira la lease de hidratación del mismo usuario sin borrar credenciales válidas; promesas tardías no pueden rehidratar el estado ni reinstalar el shell sobre una pantalla de recuperación. La carga por páginas de historial completo conserva CAS, validaciones de autoría y snapshot, y cambia solo la detección local de duplicados/orden a O(n).
- **NO confundir con solución SQL:** investigar por separado #1075 (timeouts 57014/latencia), no añadir concurrencia ni reintentos privilegiados sin evidencia; no reducir el historial, cambiar scopes, ni alterar el plazo POST_MFA_SETUP_TIMEOUT_MS.
- **Validación requerida:** test de carrera con transporte diferido y timeout, páginas máximas y duplicados adversariales, CI/Canary protegido SHA exacto, WebAuthn Coach/Admin, pruebas Cliente/móvil/tablet, M44 restauración y promoción frontend-only con rollback.

---

## WIP único · SIGNATURE B34 · Continuidad de sesiones y Coach task-first · 27-10-2026

- Base LIVE/Canary certificada B33 `72de7224808ed5856b477515b9fb2fab091c6114`; promoción #40579925000 `SUCCESS`.
- **Objetivo B34 (NO publicado):** impedir navegación tardía tras timeout de recuperación local y tras cambio de identidad/rol; evitar escaneo duplicado de snapshots ya purgados por `list()`; presentar dos sesiones Coach completas y cuatro siguientes bajo `details` nativos con todas sus acciones y el archivo histórico íntegro.
- **Límites:** frontend + pruebas + documentación; no tocar RLS, SQL, Edge, Hosted Auth, motores de ejecución ni políticas de publicación. Recuperación cancelada debe ser fail-soft, sin elevar timeouts por conveniencia.
- **Aceptación pendiente:** preflight dirigido, CI y matrices PR, Canary exacto y 13 gates de integración, WebAuthn real, QA Cliente ejecutable, producción protegida y smoke autenticado.

---
## SIGNATURE B32 · Flow-first Cliente/Coach/Admin · WIP 27-10-2026

- Fuente LIVE/Canary exacta `405b8668226410398859faa1c5b289951848d0aa` y promoción protegida #40512134436 `SUCCESS`.
- Una única rama `feat/signature-b32-flow-first-20261027`: Cliente planificación con siguiente acción solo por permisos/ejecución real, sesiones extensas mediante `details` nativos accesibles y sin eliminar cards; Cliente Agenda próxima cita únicamente futura y confirmada; agenda indexada en una pasada; Admin lista operativa prioritaria y resto íntegro accesible; composición editorial mobile-first y tests.
- No se duplican `experienceNextAction` ni motores de decisión, no se cambia ejecución/autorización, no se suprimen funciones útiles; las sesiones nunca se inician por parecer disponibles. Si servicio está pausado, ninguna CTA de inicio nueva. IRI inicial permanece separado de evolución.
- **Pendiente** hasta que suceda: tests dirigidos + CI PR completa, Canary exacto multidispositivo, validación de UX/foco/touch/teclado, release PROD protegida y smoke. No declarar B32 integrada por existir una rama o commit.
- P0 #1075 y U30–U33 permanecen carriles separados por seguridad y riesgo de DDL.

# IBERFIT · Backlog Vivo

## SIGNATURE B2 · Cliente insignia + continuidad y bloqueo de citas históricas · 2026-10-24
- **LIVE base certificado:** `e1df8837a43100452bffa397a63cb7b6aafb3488` (release [#40045429724](https://github.com/iberfit/iberfit-m26-app/actions/runs/40045429724), Cloudflare `80294470-7a18-4d49-a746-bf9278fa3666`); conserva U53-U59R y B3.1 Coach.
- **UN SOLO WIP / PR #1122** consolida PR #1123 sin perder sus commits: interfaz Cliente Hoy→Planificación→Sesiones→ejercicio/descanso/feedback→Progreso; catálogo de sesiones con estados RC39 reales, CTAs contextuales sin duplicidad, jerarquía premium y foco/touch móvil sin overlays ni CSS adicional.
- **Integridad P0:** citas confirmadas históricas no inician entrenamientos desde Hoy ni tarjetas de agenda; proyecciones legacy asociadas a citas no se presentan como sesiones autónomas. Se respeta comprobación real de autorización, estado de servicio y permiso de ejecución; Cliente Plan no confunde modalidad con sesión iniciable. Se conserva Diagnóstico IRI inicial independiente del progreso longitudinal.
- **Regresión:** 8 tests visuales/privacidad B2 + 13 tests funcionales B2 y fixtures históricas actualizadas. Comprobar toda la suite, QA autenticada, Device, WebAuthn, CI, auditoría, Canary Exact (7 gates postmerge) y una sola promoción PROD de frontend con M44 fresco y rollback; **aún NO publicado**.
- **Alcance:** frontend, tests, documentación y comentario de trigger de respaldo M44; ninguna migración, función Edge, Auth, RLS o modificación de datos PROD.

## SIGNATURE B3.1 · Coach macrobloque · 2026-10-23
- **LIVE y Canary:** SHA `e1df8837a43100452bffa397a63cb7b6aafb3488`, release #40045429724 SUCCESS; incluye B3.1, U53 y mejoras anteriores.
- **WIP único:** PR #1121 ampliado con prioridad Coach Hoy, archivo nativo de agenda y cartera prioritaria, Agenda completa agrupada y recuperación contextual de sesión bloqueada.
- **Completado:** 7 gates, Canary Exact Deploy y Production Promotion #40045429724 con M44 y rollback conservados.
- **Límites:** frontend Coach; ninguna mutación de Auth, RLS, IRI, backend ni datos.


## SIGNATURE 360 · checkpoint de Canary · 17-10-2026

- [x] PR #1019 fusionado y certificado: merge SHA `a497383896043b86548f7fa5781263e2cc71e3d3`, 12/12 workflows postmerge SUCCESS, [Canary Exact Deploy #39078154724](https://github.com/iberfit/iberfit-m26-app/actions/runs/39078154724), Cloudflare `bd38c4e3-080c-43f9-a38f-0ad3f9eab8b9`, rollback anterior identificado.
- [ ] SIGNATURE 360 de 43 rutas aún WIP. QA de sesiones Cliente sintética y read-only, no prueba de escritura remota sobre sesiones reales ni aceptación integral PROD.
- [ ] **WIP=1 del rediseño:** ergonomía Coach en sesión táctil: navegación de series, pausa y ajuste sin desbordamiento a 320 px, con Playwright y gates de dispositivo sobre SHA final.
- [ ] Promoción PROD independiente bloqueada hasta cerrar Auth P0 #1017, estabilidad bajo concurrencia y garantías de recuperación y custodia offsite. No modificar PR #1006 QA-only desde este bloque.

Las entradas con fechas previas se mantienen como historial; no representan el WIP actual de SIGNATURE 360.


## Checkpoint operativo vigente · 11 de octubre de 2026

- [x] PR #869 fusionado, SHA `053fc83df22062c636149a92a9f6386200928fea`, **12/12 postmerge SUCCESS**, Canary Exact Deploy 38152029358 aprobado, deployment `12ed932d-e2c1-4b0d-b43d-474b6fe240c6` y rollback `060289ae-649b-456c-8712-def4a4c96fa4`. Protege hidratación A→B, login misma persona y rotación JWT. No atribuirle solución comprobada al histórico timeout #821, aún abierto.
- [x] Nueva política D-023: macrobloques verticales por rama/PR funcional, CI consolidada por HEAD estable, seguridad y PROD independientes.
- [ ] **WIP=1:** Connected 360 V45 PR #870 `feat/connected360-v45-integrated-macro-20261011`, base `053fc83d…`. Escritor V45 explícito + espejo V44 transaccional e idempotente implementado/aplicado **sólo QA**, validación con cuentas sintéticas y PR CI 7/7 verdes sobre `ee73de9289a26c6c1ada124a867e2e7d5bb98140`. **Siguiente hito:** integrar esta fase limitada en Canary QA (no PROD), obtener APK Android DEBUG por SHA exacto y pasar a E2E físico/flujo automático con consentimiento. Android/iOS automático y pruebas físicas continúan pendientes; no cambiar `productionAllowed=false`.
- [ ] Validar regresión intensiva del timeout assurance #821 y eventual promoción Auth a PROD mediante pipeline de promoción separado; no usar usuario cliente real para QA.

## P1 Auth / Connected 360 · checkpoint 2026-10-11

- [x] PR #867: **12/12 checks posteriores SUCCESS**, Canary SHA exacto `f931ed39f176a7d43eff2802f5d7913ab5d07e50`, deployment `ce37fbf1-c701-4ec7-8c36-21ecf89e8577` y rollback preservado `987afaea-0515-4849-afe8-ffd4a43f2afb`. No equivale a promoción de producción.
- [ ] Issue #821: reproducir ausencia de assurance en Firefox y tablet landscape con CPU x6; diagnóstico por fase de clic/bootstrap/token/RPC, sin secretos y sin subir timeout. La instrumentación de prueba está en rama de trabajo, no validada ni fusionada todavía.
- [ ] Connected 360 V45: tabla QA vacía, RLS ON/FORCE y trigger de bloqueo; desarrollar el writer transaccional y probar revocación/idempotencia/consentimiento en QA, antes de cualquier escritura sanitaria o migración PROD. E2E físico Android/Health Connect y iOS/HealthKit todavía requerido.


## WIP principal vigente · Connected 360 — seguridad e integración nativa · 2026-10-11

- [x] PR #859 cerrado: aislamiento de sincronización ante cambio Cliente/logout y cancelación de lecturas; Canary Exact Deploy `38113954119` SUCCESS, merge SHA `b2371fd7c9857b4d035ae2bdeaeb75fcd5d69dd0`.
- [x] PR #861 fusionado, SHA Canary `bffa8ec1a54245141338d0b7282033ffedee49f8`, Exact Deploy `38114835821` SUCCESS y APK DEBUG SHA exacto `38114835828` SUCCESS; falta E2E en Android físico.
- [x] PR #863 completado en Canary SHA `f0063d76a770ff92b2fe489bd847e0ca1749f155`, Exact Deploy `38117437616` SUCCESS, Android QA push `38117437627` SUCCESS, sin cambios PROD.
- [x] PR #864 integrado y certificado: SHA Canary `3c50b9cad1345bba097a7fb86876dafa1b47387e`, Exact Deploy `38142899178` SUCCESS, Android QA `38142899147` SUCCESS, Device/CI/Auth/remote checks SUCCESS. Segunda validación de grant tras preflight V45 y aislamiento tras refresh de token.
- [ ] Concluir integración nativa real Android Health Connect y flujo Cliente `Vincular dispositivo`, sin importaciones manuales como experiencia principal; autorización explícita por métricas, estado y revocación/reconexión.
- [ ] Completar iOS HealthKit con app firmada, E2E físico y protección ante cambios de identidad, permisos y background.
- [ ] Certificar writer backend V45 en QA con fencing transaccional de revocación, autorizaciones, procedencia real, idempotencia, RLS y pruebas negativas; NO abrirlo antes ni migrar V45 a PROD.
- [ ] Certificar PROD: gates, rollback, sesión Cliente real `juancarlosjimenez54` en `app.iberfit.cl` sólo tras QA física y backend seguro. Sueño debe mostrarse como horas y minutos.
- Trabajo de imágenes/PR #809 queda en carril concurrente y no debe alterarse. Checkpoint de integración y límites: `docs/PRODUCTION_STATE.md`.


## P1 Auth QA · incidente #821 · 2026-10-11

- [x] Paridad código/runtime del broker QA #831: desplegada v13 ACTIVE (solo Supabase QA), cinco códigos de error de lectura 502 en vez de falsear rol 409, OIDC/WebAuthn intactos; digest `b27512055e3a3a33e0d63e0862444f53904b610d1f31d2f398fe33edcbfc9417`. Coach WebAuthn QA run #38142899129 reintentado tras deploy: SUCCESS.
- [x] Admin WebAuthn QA #38142899200 tras broker v13, segundo intento: SUCCESS (contrato, E2E real QA y gate). Issue #821 sigue OPEN por causa de timeouts no determinada.
- [ ] Reproducir y corregir causalmente timeouts de assurance/pre-red en tablet horizontal CPU x6 y Firefox, token 200 sin llamada assurance, refresh/logout/offline/background, instrumentación sensible safe, E2E read-only. No reducir matriz, ocultar 401 o incrementar timeout por conveniencia.
- **Evidencia:** Supabase QA 24h: perfil 223 × 200 y 1 × 401 el 10/10 a las 14:39:44Z; token y assurance 200 en solicitudes que sí alcanzaron el servidor. Sin inferir causa de solicitudes ausentes.
- **Límites:** no tocar PROD ni usuarios reales; broker QA sintético de certificación, no activar ingest wearable. Issue #821 documentado.

## Archivo histórico · Prescripción inteligente y métricas por ejercicio · PR #803
- **Actualización:** #803 MERGED Canary (SHA `43c5352ff9e48dcd7b1cf7451c4e3dd2938ca6ce`). Los siguientes checks reflejan el estado del 08/10 y **no** deben tratarse como tareas aún abiertas sin revalidación en GitHub/QA/LIVE.

- [x] Motor de siete perfiles `strength/isometric/endurance/intervals/carry/mobility/power`, UX contextual para Coach/Cliente y selector Admin implementados en PR #803.
- [x] Planificación, registro de resultados, correcciones, circuitos, copia de sesiones y plantillas tienen cobertura automatizada específica; no inferir con ello que la interacción productiva ya está certificada.
- [x] Backend PROD y QA ya cuentan con las tablas y RPC versionadas (PROD: 26 perfiles; QA: 25 por diferencia de catálogo). RLS activo, grants mínimos y paridad de función verificados. No ejecutar migraciones dos veces.
- [ ] Reconciliar los commits concurrentes de Canary, mantener los lotes de imágenes aprobadas, cerrar `Session QA isolated/browser-live-workout` y ejecutar controles sobre el SHA final.
- [ ] Completar documentación de trazabilidad, pasar PR #803 a ready y fusionar respetando ruleset.
- [ ] Certificar Canary exacto y smoke autenticado Coach/Cliente/Admin en móvil, tablet y desktop.
- [ ] Promover a LIVE mediante workflow autorizado y confirmar SHA, deployment, login y caso real Carrera suave, sin confundir backend desplegado con interfaz LIVE.
- [ ] Siguiente macro-WIP: catálogo de carrera y ciclismo por modalidades, con deduplicación, variantes y gestión Admin.


Checkpoint: 2026-10-08. Estado verificable: GitHub Actions/Cloudflare y `docs/PRODUCTION_STATE.md`.

## MACRO-WIP ACTIVO · Coach Operativo 360 — Planificación fiable hasta LIVE

- **Producción y Canary:** PR #799 integrado en source `f25201d5847b2aa66e9d6ae04736b73f4f400764`; Canary post-merge 13/13 SUCCESS y Production Promotion `37774677595` SUCCESS. Deployment exacto `7adc9f72-87d9-4746-9531-f200efaa2b85`, rollback `6a6eabef-c3fc-41ca-b4c0-846eea6d8c22`.
- **#795–#799 cerrados en LIVE:** continuidad, contexto de sesión, preparación independiente, feedback fiel y comparación planificado/registrado con evidencia real por serie.
- **PR #800 abierto, fuera de LIVE:** selección de ciclo por vigencia civil en Santiago (sin tomar el primer registro), aislamiento Cliente, recuperación del perfil vigente con duración confirmada, rechazo de campos agrupados no permitidos y vista de planificación consistente. La edición histórica no se elimina.
- **Cierre obligatorio:** suite Node/regresión, integración visual y autenticada, controles protegidos, merge Canary, Canary Exact Deploy, 100% post-merge GREEN, Production Promotion exacta, identidad runtime LIVE, rollback preservado y documentación actualizada. No cerrar el bloque en Canary.

## Referencia histórica · Estado anterior a PR #799

- **LIVE y Canary actuales:** `ade3de994e2e32f086bdc163d204599fb0a0a39b` (PR #798), Canary Exact Deploy, 12/12 workflows post-merge y Production Promotion `37770746465` SUCCESS (31/31), deployment `6a6eabef-c3fc-41ca-b4c0-846eea6d8c22`, rollback `0e540a4e-b16a-4980-b17c-b6a862f5d878`.
- **Completado:** #795 continuidad, #796 cita/sesión exacta, #797 copia independiente, #798 cierre con feedback fiel y prescripción opcional sin inventar valores. Todos publicados.
- **Siguiente tramo PR #799 (DRAFT):** evidencia planificado/registrado por ocurrencia, snapshot histórico, omisiones confirmadas, sustituciones y series añadidas; vista de Coach desplegable y responsive. Cambios solo read-only UI, pruebas y traducciones. Integración/publicación pendiente de gates completos.

- LIVE y Canary certificados: `56c485fcfa5c3f331161748111df94f4a74d4cc1`, PR #797. Canary Exact Deploy `37727148903`, 12/12 workflows post-merge y Production Promotion `37728220397`: SUCCESS.
- Deployment productivo exacto `0e540a4e-b16a-4980-b17c-b6a862f5d878`; rollback previsto `9bac834a-f0b2-4796-9237-1fa2a62c4c68`.
- Coach: PR #795 continuidad de borradores/ejecución, #796 contexto exacto de cita y #797 copia segura de sesión preparada: todo publicado.
- Bloque de cierre de feedback #798 cerrado en producción. El desarrollo activo es la comparación read-only #799; no alterar ni automatizar decisiones ya registradas.
- Cierre requerido para #799: pruebas unitarias, navegador multidispositivo, revisión de regresiones, integración protegida, Canary exacto y promoción certificada a LIVE.


- Source **PROD y Canary** `d2ab5a4f405ce6e6ace128c593bd37973b9b53b8`, PR #796 fusionado y certificado. Canary Exact Deploy `37724506133` SUCCESS, Device Gate intento 2 `37724506170` SUCCESS, promoción PROD `37726210527` SUCCESS (deployment `9bac834a-f0b2-4796-9237-1fa2a62c4c68`; rollback `8e1c0c01-4a6f-4cf4-9947-23f5520721aa`).
- Recorrido: ficha → planificación → preparación → ejecución → cierre → seguimiento → siguiente sesión, consolidando módulos existentes.
- Tramo certificado en LIVE: sesión exacta de cita/última ejecución, contexto de agenda en curso, estados canónicos y feedback por fecha efectiva de cierre. 13/13 workflows post-merge GREEN; rollback reservado, no ejecutado.
- PR #797 terminó certificado en LIVE: sesión contextual copiada de manera independiente; publicación y visibilidad verificadas antes de iniciar, con pruebas touch/teclado y suites completas.
- Después consolidar ergonomía de planificación, sesión real, cierre y continuidad; el macro-WIP no queda terminado por publicar estos dos tramos.
- Referencia de interacción: `DESIGN.md` y componentes actuales; preservar tokens, jerarquía y controles nativos. Guía Refero de formularios/focus/touch: acción explícita, contexto estable, sin nuevo panel ni métricas duplicadas.
- Sin cambios en Supabase, roles, RLS, Command Bus ni Media Factory.

## WIP CERRADO · Coach Operativo 360 — Continuidad de planificación y sesión

- PR #795, base `bb9f2f56810e83a908257651aa19b5f69f4efe1a` (source de Canary/PROD certificado mediante promotion `37718656193`).
- Alcance deliberado: reforzar una sola operación Coach existente, no duplicar fichas, editor de planificación, ejecución, cierre, seguimiento ni controles Admin.
- Corrección publicada: al cambiar entre clientes/planes/ejecuciones durante el debounce, conservar y confirmar cada borrador con su propietario real; no sustituir el contexto pendiente por el nuevo.
- Inicio de sesión: impedir carreras entre acceso automático desde shell y CTA explícito; bloquear salida duplicada o simultánea a una mutación.
- Tests: cambio rápido entre dos borradores, flush forzado, checkpoints de series entre dos clientes, inicios concurrentes y salida de sesión bajo carga.
- Cerrado en PROD mediante promoción `37722367430` SUCCESS, source `366feb554c7922e06e4e124094e4bae043ae1efe`; identidad/runtime LIVE, Chromium, auditoría read-only y rollback certificados por el workflow.

## WIP CERRADO · Entrenamiento Operativo 360 · núcleo canónico

- [x] PR #726 mergeado en Canary; SHA certificado `1391805fd36fd40e1624e9f06ea378ec37719eb1`.
- [x] Canary post-merge certificado con CI, Data Safety, Continuous Audit, QA Real Write, Session QA, Client Interaction, Device Experience, WebAuthn y Canary Exact Deploy.
- [x] PROD promovido mediante Production Promotion `37307405924`: SUCCESS, rollback no requerido.
- [x] Una sola frontera moderna de mutación de entrenamiento mediante Command Bus.
- [x] Servicio activo requerido para crear/reactivar trabajo; progreso de ejecución ya iniciada no queda atrapado.
- [x] Journals canónicos read-only para authenticated y RLS preservado.
- [x] Prescripción ≠ observación; objetivo planificado no inventa RPE/RIR.
- [x] Ruleset `Protect Canary` activo con required checks estrictos `validate` + `canary-policy-gate`.

## WIP CERRADO · Experiencia Guiada 360 · PR #727

- [x] Coach Live autocompleta solo lo seguro, preserva trabajo humano y lleva al dato humano pendiente.
- [x] Planificación reutiliza memoria confirmada de ejercicio como borrador revisable; RPE/RIR observados no se inventan.
- [x] Admin alta/edición usa campos contextuales, borrador y foco al primer dato necesario.
- [x] Onboarding/continuidad evita pedir de nuevo lo conocido y oculta lo que no aplica.
- [x] Merge SHA `bb41367341604babf018e1ea4774c368673e1189`; promoción PROD #314 SUCCESS.

## WIP CERRADO · UX/Autocompletado Global 360 · PR #728

- [x] Dato confirmado → puede proponerse; desconocido → permanece vacío; edición humana → prevalece.
- [x] Planificación usa ciclo → IRI → perfil confirmado sin defaults profesionales inventados.
- [x] Agenda reutiliza modalidad/duración/dirección confirmadas y deja de autocompletar tras edición manual.
- [x] Admin/Onboarding/Engagement/Comunicación/Biblioteca/Informes comparten progreso guiado idempotente.
- [x] Merge SHA `56421d74fa52b08a949c34ef6c016162882d217b`; Canary Exact Deploy y gates UX post-merge SUCCESS.
- [x] Production Promotion #315, run `37332004338`: SUCCESS; rollback no requerido.

## WIP INTEGRADO · Interaction Reliability 360 · PR #729

- [x] Hardening global de autofill/focus/caret/select para formularios autenticados, sin degradar el contrato Auth específico.
- [x] Scroll seguro de controles enfocados frente a topbar, teclado virtual, navegación inferior y safe areas.
- [x] Overlays/modales con overscroll contenido, touch momentum y scroll estable.
- [x] PWA instalada: tablet landscape añadida a la matriz N-1 → N.
- [x] Device Policy reconciliada con Admin/Coach autenticado + WebAuthn recurrente en Canary.
- [x] Admin Matrix Chromium/WebKit/Firefox + desktop/tablet portrait/tablet landscape/mobile GREEN.
- [x] Pre-merge: CI, Fast Lane, Continuous Audit, Device Experience, Client Interaction, evidencia visual y WebAuthn GREEN.
- [x] Merge exacto PR #729 → `744fe36112ff1c61e3b61772f3c74943edee08f2`; `canary/rc74-4` verificado en ese SHA.
- [x] Canary Exact Deploy #172 (`37341609208`) SUCCESS sobre `744fe361...`; gates post-merge de interacción y autenticación GREEN.

## WIP CERRADO · Personas + IRI real en terreno + Solo IRI

PR #678 cerrado sobre source funcional `44f95a7905df63d5b7b69f798080e20790340abe`.

- [x] Lifecycle canónico `iri_only`, alta sin frecuencia de entrenamiento, Coach y acceso conservados.
- [x] Personas/filtro/conversión; Solo IRI excluido de cartera, capacidad, renovaciones y alertas de entrenamiento.
- [x] Protocolos reales de terreno + presets + validez separada de normas/comparabilidad + informe baseline independiente.
- [x] QA transaccional sin residuos: alta/replay, consentimiento físico, `IRI_COMPLETAR` por RPC público, persistencia typed/domain, conversión conservando la misma persona y el mismo IRI inicial.
- [x] Suite oficial offline: 3.098 PASS, 1 SKIP, 0 FAIL en el checkpoint funcional; regresiones adicionales y workflows posteriores verdes.
- [x] 12 specs nuevas locales Chromium 141 y matrices posteriores desktop/tablet/móvil.
- [x] Validación final del comando cinta 3 min y variables FC YMCA/adaptado corregidas.
- [x] Head PR final: 10/10 workflows SUCCESS.
- [x] Merge SHA: 14/14 workflows de integración SUCCESS.
- [x] Canary Exact Deploy `37071775508`: SUCCESS.
- [x] Migración PROD `client_lifecycle_iri_only_v1` aplicada y postcheck de constraint/default/ACL correcto; 0 fixtures `iri_only` residuales.
- [x] Promoción PROD `37073343426`: SUCCESS; deployment exacto `116ab848-6b64-4edc-b57c-7e853965a85d`.
- [x] LIVE: source `44f95a7905df63d5b7b69f798080e20790340abe`, runtime PROD, Auth assets, Chromium interactivo y auditoría read-only certificados.
- [ ] Métricas comerciales separadas de IRI realizados, conversiones e ingresos: mantener como trabajo posterior; no inferir ingreso por lifecycle ni por completar evaluación.

Criterio de cierre: el write path completo se certificó con datos sintéticos y ROLLBACK en QA; PROD se validó sin crear datos de salud ficticios. IRI inicial permanece separado de seguimiento/evolución.

### Evidencia PubMed revisada durante #672 · pendiente de decisión de producto

No convertir estos candidatos en requisitos ni baremos sin decisión explícita y protocolo/versionado exactos.

- **Capacidad de esfuerzo**
  - 1MSTS: revisión sistemática de propiedades clinimétricas, PMID `30489442`; referencias chilenas 18–80 años, PMID `39879255`.
  - YMCA 3-Min Step: mantener como protocolo distinto cuando se ejecute exactamente; revisión de tests de campo en adultos PMID `34442050`; estudio de validez en adultos jóvenes PMID `32328445`.
  - 6-Minute Walk Test: candidato opcional cuando exista espacio; validez de campo en adultos PMID `29851229` / `40148739`; referencias chilenas 20–80 años PMID `21249280`.
  - Chester Step Test: candidato de seguimiento aeróbico; revisión de step tests PMID `26670455`, pero la estimación de VO2 requiere cautela y práctica/familiarización.
- **Movilidad**
  - Weight-Bearing Lunge: mantener; revisión sistemática de fiabilidad/MDC PMID `25704110`.
  - Back-Saver / sit-and-reach: revisar sustitución; la revisión de validez en adultos PMID `34442050` no lo respalda como medida válida conjunta de isquios + región lumbar.
  - Active Knee Extension o Straight-Leg Raise: candidatos para isquios; excelente fiabilidad en adultos con déficit de flexibilidad, PMID `25364856`.
  - Thomas modificado: mantener sólo con control pélvico estandarizado; sin ese control presenta mala validez, PMID `27602291`.
  - Rotación de cadera: considerar medición cuantitativa estandarizada en lugar de observación cualitativa; la posición no debe intercambiarse entre seguimientos (PMID `29364046`).
- **Fuerza / función**
  - 30-s Chair Stand: mantener; referencias chilenas 18–80 años PMID `40526861`.
  - Handgrip: candidato opcional si se dispone de dinamómetro; revisión de propiedades de medida PMID `31730754`.
  - Biering–Sørensen: mantener opcional con equipo compatible; meta-análisis de fiabilidad PMID `32365490`.
  - Prone bridge/plancha: útil como resistencia del tronco, no como diagnóstico de «estabilidad»; PMID `29861239` / `28544083`.
- **Balance / control neuromuscular**
  - SEBT/Y-Balance: candidato opcional si aporta una decisión real; revisión de fiabilidad PMID `31598406` y meta-análisis PMID `34631241`.
  - No usar FMS como predictor individual de lesión: revisión/meta-análisis PMID `26502447`.

Estado: **evidencia recopilada, sin incorporación de nuevos tests al producto**. Primero decidir qué dominios justifican el tiempo de evaluación y qué resultado cambia realmente una decisión del Coach.

## P0 · guardrails permanentes

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad y disponibilidad.
- [ ] Nunca hacer pruebas destructivas con usuarios/datos reales.
- [ ] Ante P0 LIVE: hotfix mínimo desde identidad LIVE exacta.
- [x] P0 focus/input/select corregido y protegido por matrices autenticadas, Admin y Device.
- [x] Reentrada background/online refresca sesión sin rehidratar ni perder foco.
- [x] Refresh token revocado termina sesión sin bucles de reintento; red/timeout permanece recuperable.

## P1 · release / Auth

- [x] Recuperar proyecto Cloudflare productivo exacto y rollback.
- [x] Mantener promoción por SHA exacto y fail-closed.
- [x] Corregir `site_url` PROD a `https://app.iberfit.cl/`.
- [x] Cerrar signup público y elevar mínimo de contraseña a 8.
- [x] Añadir contrato de Auth Hosted readiness.
- [x] Evitar interferencia/cancelación entre suites QA autenticadas compartidas.
- [x] SMTP transaccional Resend operativo con SPF/DKIM/DMARC.
- [x] 13 plantillas Hosted Auth sincronizadas y verificadas.
- [x] OTP email real + recovery real certificados.
- [x] Reauthentication de cambio de contraseña activa.
- [x] Logout normal local por dispositivo; revocación global explícita y confirmada.
- [x] WebAuthn QA alineado con PROD y recertificado.
- [x] OTP resend conserva la pantalla; expiry/replay/rate-limit/mala conexión diferenciados y protegidos.
- [x] Edge de invitación QA/PROD convergida a una fuente canónica sensible al proyecto.
- [x] QA invite Edge valida bearer internamente y rechaza Coach / token inválido en red.
- [x] Admin puede reintentar invitaciones fallidas sin recrear cliente ni duplicar identidad.
- [ ] Certificar E2E positivo real de invitación/reenvío con una cuenta Admin QA autenticada y assurance privilegiada.
- [ ] Recertificar el lote Auth completo inmediatamente antes de próxima promoción PROD.

## P1 · gobernanza

- [x] `canary/rc74-4` protegido mediante ruleset `Protect Canary`, enforcement activo y required checks estrictos.
- [x] Mantener documentación STATE/BACKLOG alineada con SHA real.
- [ ] Retirar/rehacer PRs abiertos obsoletos con base antigua antes de reutilizarlos.

## P1 · experiencia por dispositivo / rol

- [x] Cliente QA real desktop/tablet/móvil.
- [x] Coach autenticado + WebAuthn representativo en Device Gate.
- [x] Admin sintético y PWA/update matrix certificados.
- [x] Focus/input/select P0 corregido en flujos previamente certificados.
- [ ] **En curso en Interaction Reliability 360:** hardening global de focus/autofill/password/select y recertificación por navegador/dispositivo.
- [x] Acciones Coach de un paso portadas sobre Canary certificado.
- [x] Admin autenticado QA real recurrente + WebAuthn en desktop, tablet portrait, tablet landscape y móvil mediante workflow dedicado de Canary.
- [ ] **En curso:** modal/scroll largo/teclado virtual/focus y surfaces con scroll propio; Admin real recurrente ya está GREEN.
- [ ] Recertificar alta/edición/baja controlada de Cliente y Coach con identidad Admin QA real y sin freezes.

## P1 · producto / entrenamiento

- [ ] **Preparar próxima sesión**: IRI inicial separado de evolución + plan + última carga + feedback + dolor/recuperación + adherencia + pendientes; Coach confirma.
- [ ] **Action Outcome Tracking**: señal, decisión Coach, intervención y outcome.
- [ ] **Seguimiento longitudinal**: progreso y reevaluaciones sin mezclar con el Diagnóstico IRI inicial.
- [ ] Sesión Coach ultrarrápida: ejercicios, variantes, series, repeticiones, carga, descanso, alternativas, biseries/triseries/circuitos/AMRAP/Tabata y feedback.
- [ ] **Reactivación asistida** ante caída de adherencia.
- [ ] **Hoy contextual** con una próxima acción útil para Cliente.
- [ ] Integrar/rehacer sobre Canary actual la mejora de ventanas 4/8/12/Todo de evolución por ejercicio; PR #444 está obsoleto y no es mergeable.

## P1 · seguridad / backend

- [x] Revisados los 2 SECURITY DEFINER ejecutables por anon: catálogo/media públicos, lectura acotada y deliberada.
- [x] Revisados RPC Admin críticos: privileged assurance + rol + organización + scope antes de mutar.
- [x] SECURITY DEFINER auditados por intención en QA/PROD; PR #730 promovido. Migración PROD `20261005173632_security_backend_acl_hardening_v1`; authenticated SECURITY DEFINER 55→52, RPC canónicas intactas.
- [x] RLS auditado: 0 tablas públicas sin RLS; tablas con RLS y 0 policies tienen 0 grants para `anon/authenticated`, por diseño fuera de Data API.
- [x] FKs sin índice evaluadas contra cardinalidad, consultas reales e `EXPLAIN`; no se justifica añadir índices hoy. Reevaluar por crecimiento + hot path + plan/coste real.
- [x] Promotion #316 (`37349796344`) SUCCESS: LIVE `70dfbdc5...`, deployment `75ab5fa1-eb8a-4069-ab65-ddbc3649285b`, rollback `14486b12-8e68-47de-8212-921573328ff4`.
- [ ] Leaked password protection: evaluada por el workflow productivo; sigue no disponible en el plan actual. No forzar upgrade sin decisión de coste/operación.

## P1 · negocio / escalabilidad

- [ ] Funnel lead -> conversación -> IRI -> cliente -> plan -> primera sesión -> 30/90/180.
- [ ] Instrumentar reactivación, referral y revenue.
- [ ] Medir minutos Coach/cliente/semana.
- [ ] Medir clientes activos/Coach, ocupación, capacidad y margen/hora por modalidad.
- [ ] Cohortes de adherencia/retención y outcome de intervenciones.

## P2 · UX / visual / rendimiento

- [ ] Unificar “requiere atención / siguiente acción” entre Cliente, Coach y Admin.
- [ ] Progreso longitudinal con más jerarquía que tarjetas aisladas.
- [ ] Menos contenedores; más espacio y tipografía sin perder densidad útil.
- [ ] Empty states siempre accionables.
- [ ] Gráficas responsive semánticas: móvil resume, desktop explora.
- [ ] Core Web Vitals / presupuesto por dispositivo.
- [ ] Auditoría manual de contraste, focus, teclado, lector y touch targets.
- [ ] Medir arranque, auth bootstrap y navegación.
- [ ] Mantener observabilidad sin exposición de datos.

## Siguientes 5 acciones

1. Revisión funcional completa del IRI cerrado: opciones, protocolos, estados, persistencia, roles, informes, conversión y límites; validar producto antes de abrir otro gran WIP.
2. Corregir sistémicamente la regresión visual de inputs focus/autofill/password y certificar login + formularios críticos en desktop/tablet/móvil.
3. Admin QA real autenticado desktop/tablet/móvil + E2E positivo de invitación/reenvío y alta/edición/baja controlada sin freezes.
4. Motor Coach: preparar próxima sesión + ejecución ultrarrápida + Action Outcome Tracking + seguimiento longitudinal separado del IRI inicial.
5. Cerrar seguridad/backend restante por intención y EXPLAIN, y después continuar negocio/retención/cliente contextual.

No abrir el siguiente gran WIP de producto hasta completar la revisión funcional del IRI y el fix visual inmediato solicitado.
