# M43 — Entrega única integral · Entrenamiento IBERFIT

**Naturaleza:** contrato operativo de un único macrobloque, derivado de `IBERFIT_NEXT_ULTRAPREMIUM_M41_M45_MASTER.md`.
**Estado actual:** en desarrollo en el PR draft #932. **No autoriza merge ni promoción parcial.**
**Fuente de realidad inicial:** producción `64725ec2ab0b77c46ddb79ff1a79cb3ef72dc71b` (primera corrección de informes), rama Canary `canary/rc74-4`.

## Resultado final exigido (no funcionalidades aisladas)

Un Coach puede preparar varios ciclos del mismo cliente, periodizarlos, construir sesiones de fuerza, carrera, natación, movilidad y combinadas, asignarlas, guardar borradores, previsualizar, validar, publicar, modificar mediante revisiones, registrar en directo y revisar resultados. El Cliente entiende su plan, accede a las sesiones que le corresponden, ejecuta una sesión autónoma si está autorizado, registra observaciones y recibe devolución. Ambos ven lo **confirmado** y nunca datos inferidos como si fueran registrados.

### 1. Arquitectura, permisos y verdad remota

- Reutilizar un único motor de ciclos, sesión, ejecución y publicación existente. Prohibido crear segundo constructor o sistema paralelo.
- Persistencia por ID estable de `cycle`, `session`, `execution`, `report`; cliente, Coach, servicio y revisión correctos.
- Idempotencia con identidad de operación, doble clic, reintentos, pérdida del ACK, conflicto de revisión, multitab y dos dispositivos.
- Estados diferenciados: borrador local / borrador remoto / validación interna / aprobación / publicado / retirado / disponible / en curso / completado.
- Error de campo solo cuando falla un campo realmente obligatorio; explicar fallos de red, almacenamiento, permisos y conflictos por separado.
- Sin datos inventados, sin borrado de históricos, sin contaminar otra persona ni elevar autorización por UI. RLS, backend y roles verificados.
- El IRI inicial no se confunde con evolución ni convierte un `Solo IRI` en servicio de entrenamiento activo.

### 2. Coach: planificar y publicar en segundos

- Ciclo y periodización: fechas, objetivo, semanas, frecuencia, duración, modalidad, fases, carga, sesiones programadas y realizadas.
- Borradores independientes por cliente+ciclo+entidad; selector legible, guardado automático, recuperación y coexistencia del formato antiguo.
- Sesión con título, objetivo, duración, ejercicio y bloques; controles táctiles rápidos, buscar ejercicios, alternativas, duplicar, reordenar y deshacer.
- Fuerza: series, reps, carga, tiempo, RPE, RIR, descansos, biseries, triseries, circuitos, AMRAP y Tabata donde aplican.
- Carrera: continua, fácil, intervalos, ritmos `min/km`, distancia, tiempo, recuperación, zonas FC opcionales y fases.
- Natación: estilo/bloques, piscina, metros, series, pausas, objetivos `min/100m` y registro medido separado de estimaciones.
- Modalidad presencial (Coach dirige y registra) versus guiada (Cliente puede iniciar dentro de reglas).
- Previsualización real de Coach y Cliente; revisión y publicación sin duplicar, con autorización y errores concretos.

### 3. Cliente: entrenar sin fricción

- Antes: objetivos, material, duración, bloques y próximo paso en Hoy / Mi plan; solo mostrar la sesión publicada.
- Durante: tarea actual, instrucciones visuales aprobadas, temporizadores robustos, descanso editable según permiso, controles accesibles, continuidad del progreso.
- Registro por deporte: series y cargas en fuerza; distancia, duración y ritmo real en running; metros, duración y ritmo real `min/100m` en natación.
- Datos planeados y medidos con textos, unidades y procedencia separados; nunca rellenar observado con el objetivo.
- Retomar sesión tras interrupción de conexión, background, reinicio PWA o cambio de pantalla, con reconciliación remota y retry.
- Después: confirmación de sesión completada, esfuerzo percibido, molestias y observaciones, devolución del Coach y continuidad de plan.

### 4. Feedback y trazabilidad profesional

- Coach ve planificación frente a resultados comparables, desvíos, substituciones y correcciones auditables.
- No mostrar hitos o indicadores sin muestras suficientes ni mezclar registros ficticios.
- Acceso en contexto a lo anterior, recomendaciones justificadas, decisión profesional y próximo paso.
- No duplicar ni pisar progreso confirmado por dos pestañas o dispositivos.

### 5. Certificación del macrobloque entero

- Unit/integration: compilación, tipo/lint según proyecto, módulos de planificación, deportes, motor de ejecución, feedback y publicación.
- QA real con identidades sintéticas: Coach → crear ciclo → editar y recuperar dos borradores → validar → construir → previsualizar → publicar → Cliente ve SOLO publicado → iniciar autonomía → registrar datos → feedback → Coach inspecciona.
- Matriz paralela: presencial con cita / guiada sin cita / Solo IRI / ciclo inexistente / datos inválidos / offline / backend 4xx-5xx / sesión expirada / multitab y refresh tras ACK / scroll-foco-touch.
- Dispositivos: móvil 320px a desktop, tablet, teclado, lector, contraste, safe-area, reducción de movimiento y PWA N-1→N sin bloqueo.
- Pérdidas y regresiones: 0 datos borrados, 0 órdenes duplicadas tras ACK, 0 leak Cliente↔Coach↔Admin, 0 sesión sin publicar expuesta, 0 cambio de ciclo inadvertido.
- Gates obligatorios: PR GREEN + QA escritura real + Device/Browser + Canary exacto posterior al merge + promoción única a PROD + SHA live, runtime PROD y rollback anterior comprobados.

## Trazabilidad de implementación existente o en construcción

| Área | Fuente de verdad / contrato | Situación |
|---|---|---|
| Ciclos y períodos | `workflows/planning-workflow.js`, `planning/periodization-workbench.js` | Existe; ampliación y E2E pendiente |
| Borradores de ciclo | `workflows/planning-draft-safety.js`, `app/workflow-controller.js` | WIP #932, no promovido |
| Constructor/prescripción | `workflows/session-builder.js`, `workflows/session-ui.js` | Existe; revisión UX/QA integral pendiente |
| Running | `exercises/running-prescription-feedback.js` y tests `m26_training_running_premium_macro` | Existe; E2E y trazabilidad de datos pendiente |
| Natación | `exercises/swimming-prescription-feedback.js`, `workflows/session-execution.js` | Integración #908 adaptada en #932; QA pendiente |
| Ejecución | `workflows/session-controller.js`, `workflows/session-execution.js` | Existe; pruebas autenticadas de recuperación pendientes |
| Publicación segura | `workflows/publication-workflow.js`, `command-bus.js`, `supabase-transport.js` | Existe; prueba integral del flujo pendiente |
| Evolución y feedback | `engagement/progress-*`, `workflows/session-execution.js` | Existe; trazabilidad Coach→Cliente pendiente |
| Seguridad | RLS/roles/servicio/canon de backend existentes | Validación E2E M43 pendiente |
| Producción | Workflow `production-promote.yml` | Prohibido hasta cerrar la matriz total |

**Regla de entrega:** los commits intermedios y los checks verdes parciales no cambian el estado del macrobloque. M43 estará terminado cuando todo el sistema integrado funcione en producción y exista evidencia real de los criterios anteriores. Los siguientes M44 y M45, y el cierre pendiente de M41/M42, seguirán exactamente la misma regla de **macrobloque único por M**.


### Nota de certificación y control de calidad

El estado verde de CI no sustituye la evidencia de Coach → Cliente contra Supabase QA.
Los cambios concurrentes tras el ACK, la coexistencia de borradores y los dobles
clics en publicación quedan protegidos por pruebas de regresión. La certificación
autenticada integral, la comprobación de Canary y la promoción a PROD siguen
siendo controles independientes y obligatorios.

## Certificación autenticada M43 en QA real

La ruta `scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs` ejecuta los constructores reales del producto frente a Supabase QA con identidades sintéticas de Coach y dos Clientes, sin mocks, service_role ni egress a producción. Certifica ciclos independientes, permisos, ACK e idempotencia, aprobación y publicación, sesión de fuerza/running/natación, habilitación, ejecución autónoma, feedback, historial y aislamiento. Incluye comprobación explícita de que los ciclos no publicados no sean visibles al Cliente. La evidencia queda minimizada en `recovery/m43-qa/coach-client-real-write.json`.

El gate falla ante cualquier bloqueo real o fuga de borradores; no se ignoran resultados para poner CI en verde. Su aprobación no sustituye las pruebas de dispositivos, Canary exacto ni el despliegue certificado a producción.

## Defecto real descubierto por QA y corrección estructural

La certificación autenticada M43 detectó `PLAN_VALIDATE_PREFLIGHT_ENTITY_NOT_FOUND` al crear un ciclo nuevo con Coach autorizado y servicio activo. La función antigua de preflight exigía una entidad existente aun cuando el ejecutor canónico permite `PLAN_VALIDAR` inicial y `SESION_PUBLICAR` inicial con previsualización. La migración `supabase/migrations/20261014051500_m43_coach_preflight_client_projection_v1.sql` reproduce exactamente esos estados iniciales sin relajar autorización, aislamiento de cliente, servicio activo, preview, conflictos ni registro de operaciones.

La misma migración refuerza la respuesta `SECURITY DEFINER` de bootstrap: el Cliente deja de recibir ciclos o sesiones sin publicar en `trainingCycles`, `sessions`, `m26Entities`, así como eventos internos y revisiones de entidades ocultas. Coach/Admin conservan su proyección completa. El rollback explícito es `supabase/qa-rollbacks/20261014051500_m43_coach_preflight_client_projection_v1_rollback.sql`.

**Situación de entrega:** requiere aplicar y certificar primero en QA con el gate autenticado; no equivale a merge, Canary ni producción.

### QA M43: habilitación atómica después de publicación

La segunda prueba real confirmó que `SESION_PUBLICAR` ya realiza `SESION_HABILITAR` dentro de la misma transacción para sesiones guiadas (M37): el estado confirmado queda `disponible`, revisión 2. Enviar una habilitación adicional genera `INVALID_TRANSITION` correctamente. Se adapta la certificación y el servidor sintético de pruebas para usar el estado y revisión **canónicos** después del ACK, evitando comandos redundantes; las sesiones que no estén todavía disponibles siguen requiriendo habilitación explícita.

### Certificación UI autenticada posterior a QA API

`playwright.m43-authenticated-browser.config.mjs` incluye pruebas reales de interfaz Cliente en Chromium escritorio (1440), tablet táctil (1024) y móvil táctil (390). El job `M43 real Client browser current-source` se ejecuta **después** de la escritura real Coach→Cliente con `needs`, sobre la compilación exacta del PR y los mismos datos sintéticos de QA. Comprueba inicio de sesión, carga interactiva, sesión publicada e historial, ausencia de ciclos internos, navegación Planificación/Sesiones, desbordamiento horizontal y errores del navegador. Las solicitudes de escritura se bloquean con la política read-only existente, y se adjunta evidencia de pantalla. Su PASS no sustituye Canary exacto, WebKit ni pruebas de Coach con WebAuthn.

### Capturas reales y RC39: corrección de historial y responsive

Playwright mostró que la interfaz Cliente activa en Sesiones es RC39 (no la ruta anterior M26). La nueva prueba conserva el backend real, pero verifica encabezados, controles y contenido de la pantalla actual. Además se devuelve a RC39 el historial de ejecuciones completadas ya disponible en el view-model canónico (nombre, fecha, número de registros y RPE confirmado), sin exponer eventos internos ni notas privadas. Las etiquetas de capacidades de Live Workout se distribuyen en filas en teléfonos pequeños, y Playwright comprueba visualmente que no se superponen.

### Hallazgo de navegador: ejecución confirmada omitida al reconciliar dominio

En la certificación Playwright autenticada del SHA `f933b643`, RC39 mostraba la sesión publicada pero el historial vacío en escritorio, tablet y móvil. La causa estructural era el adaptador de `domain_entities_v26`: conciliaba `planning` y `session` pero no `session_execution`, y el API V26 confirmaba la ejecución sin depender de un espejo legacy `session_executions`. Se incorpora la conciliación a `sessionExecutions` antes de aplicar la proyección de rol del Cliente. Las pruebas incluyen la hidratación completa, ACK sin espejo legacy, deduplicación por revisión, seguridad de campos privados, integridad de identificadores y ausencia de datos de otro cliente. La nueva prueba E2E real de navegador debe demostrar que el historial se ve después del login.

### Seguridad de feedback tras restaurar ejecución canónica

La prueba de regresión detectó además que el proyector de `sessionExecutions` permitía transmitir propiedades anidadas arbitrarias de `feedback`. Se limita el feedback Cliente al contrato explícito de `finishExecution`: `sessionRpe`, `comment`, `pain`, `painNotes`. Se mantienen intactas las métricas confirmadas en `results`, eliminando la posibilidad de que un campo adicional de notas internas acabe en el Cliente. Esta proyección solo afecta al rol Cliente; el Coach conserva la vista profesional.

## Checkpoint de endurecimiento M43 — 14 de octubre de 2026

- El candidato `2b6918bc073c8baedacc0d899563cbcc56bb01d6` alcanzó 11/11 workflows GREEN, pero el test Coach salía en verde al validar únicamente la barrera WebAuthn, **sin certificar la navegación tras completar MFA**. Esto no autoriza cerrar el módulo Coach.
- Se amplió Playwright Cliente a 320 px (además de 390, 1024 y 1440) y se conserva la evidencia de pantalla incluso en PASS. La prueba Coach declara SKIPPED el panel post-WebAuthn cuando el segundo factor legítimo no está disponible; jamás se simula una sesión privilegiada como si estuviera autenticada.
- El servidor QA recibió la migración `20261014111500_m43_client_execution_http_projection_v1.sql`, con rollback `supabase/qa-rollbacks/20261014111500_m43_client_execution_http_projection_v1_rollback.sql`. Filtra resultados, feedback, eventos y metadatos internos de ejecuciones canónicas y legacy **antes** del frontend, conservando lo necesario para el historial confirmado. Se verificó con datos sintéticos y 12/12 ejecuciones QA sin pérdida de identidad, estado ni número de resultados.
- La aceptación real de escritura Coach→Cliente incluye ahora comprobaciones adicionales sobre el JSON bruto autenticado que devuelve `iberfit_bootstrap_v26`; esto impide que la proyección visual oculte una fuga de datos presente en la API.
- `scripts/ops/verify_m43_prod_schema.mjs` verifica **22 condiciones** de backend y seguridad, incluida una ejecución SQL sintética que comprueba el efecto real del filtrado. Sus pruebas unitarias son `tests/m43_prod_schema_release_gate.test.mjs`.
- **Estado QA/PROD:** ambas migraciones M43 están aplicadas únicamente en QA. En PROD no consta ninguna migración M43. El workflow `.github/workflows/production-promote.yml` **todavía no llama** al nuevo verificador: la modificación directa quedó bloqueada por los controles de la integración. No saltarse la barrera ni promover automáticamente hasta integrarlo y verificarlo.
- **Pendiente real:** resultado GREEN del SHA más reciente, recorrido Coach post-MFA con identidad QA válida, auditoría de datos brutos/publicación y revisión de recuperación entre dispositivos, gate de backend acoplado a promoción, compatibilidad/migración PROD controlada, Canary/preview exacto y comprobación real LIVE del SHA y rollback. Sólo entonces pasar M43 a completado y continuar M41, M42, M44 y M45 en sus respectivos ultramacrobloques.

## Control integral de privacidad en publicaciones M43

La auditoría de QA detectó que los Clientes recibían datos internos en el JSON original de las sesiones y planificaciones publicadas, aunque el frontend los ocultara. Se añade **migración versionada M43 V2** `20261014143500_m43_publication_http_privacy_v2.sql` y rollback específico, que restaura la V1 sin alterar datos. Los helpers de SQL son `SECURITY INVOKER`, no tienen acceso directo desde `anon`/`authenticated`, y proyectan las publicaciones visibles como datos mínimos; los bloques deportivos conservan métricas y prescripciones, mientras la modalidad presencial muestra solo resumen.

El verificador de compatibilidad en PROD amplía su contrato de 22 a **29 comprobaciones**, incluyendo autorización de helpers y el comportamiento semántico de redacción con datos sintéticos. **No declarar aplicado a QA/PROD hasta verificar la migración y no promocionar el frontend con una respuesta incompatible.** La revisión de IRI inicial permanece separada del seguimiento longitudinal.

## M43 cierre RLS/Data API: lectura directa de JSON privado

**Hallazgo bloqueante:** `public.domain_entities_v26` tenía `SELECT` para `authenticated` y `anon`, aunque RLS solo limita filas, no el contenido de `body`/JSONB. Un Cliente autorizado para su sesión publicada podía solicitar directamente la fila sin pasar por el bootstrap sanitizado. Por ello la migración V2, por sí sola, no bastaba para certificar la privacidad.

**Solución M43 V3** `20261014150000_m43_domain_entities_api_read_fence_v3.sql`: revoca exclusivamente la lectura directa de la tabla para los roles externos; conserva `service_role` y la lectura interna a través de las funciones `SECURITY DEFINER` de ámbito. Todas las funciones SQL que referencian directamente la tabla en QA se auditaron como `SECURITY DEFINER`, y el transporte frontend consume RPCs. No se alteran registros, RLS ni concesiones de escritura. Incluye rollback explícito de GRANT (solo para recuperación controlada).

El contrato de producción pasa a **32 comprobaciones**, con puertas separadas para denegación `anon`, denegación `authenticated` y lectura interna `service_role`. **Exige certificación autenticada postmigración y Canary exacto antes de producción.**
