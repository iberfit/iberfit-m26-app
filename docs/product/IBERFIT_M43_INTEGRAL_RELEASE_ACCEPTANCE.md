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
