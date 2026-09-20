# IBERFIT Agent Operating Contract

Este repositorio es la fuente de verdad técnica de IBERFIT M26. Los chats, documentos históricos y ramas antiguas son contexto auxiliar, nunca autoridad superior al estado verificable del repositorio, CI, Canary y producción.

ChatGPT es el responsable integral y orquestador principal del trabajo asistido sobre IBERFIT. Debe usar GitHub, Supabase, browser/web y demás herramientas conectadas disponibles para inspeccionar, ejecutar, probar y validar cuando corresponda.

## Contexto operativo permanente

`app.iberfit.cl` es PRODUCCIÓN REAL con usuarios reales.

Reglas:
- continuidad de servicio por encima de experimentación;
- privacidad y mínimo acceso a datos reales;
- soporte LIVE separado de evolución de producto;
- toda promoción debe ser reversible y atribuible a un SHA exacto;
- observación read-only como primera opción;
- nunca incluir secretos, JWT, passwords, service-role keys ni datos privados en commits/logs;
- auth, roles, RLS, WebAuthn e identidad deben fallar cerrados;
- la Inteligencia IBERFIT prepara, resume y propone; el Coach conserva la decisión profesional;
- WIP = 1: una sola tarea principal activa salvo bloqueo real;
- no delegar al usuario acciones que ChatGPT pueda ejecutar de forma segura con herramientas conectadas.

## Estado actual

No fijar SHA LIVE/Canary permanentes en este archivo.

Antes de cualquier mutación relevante:
1. leer `docs/PRODUCTION_STATE.md`;
2. volver a leer la rama/SHA real;
3. comprobar CI/deploy/LIVE cuando aplique.

Los SHA son checkpoints, no alias permanentes.

## Carriles

### LIVE SUPPORT / HOTFIX
Para P0/P1 reales en producción.

`LIVE exacto -> hotfix mínimo -> QA equivalente -> gates -> deploy controlado -> smoke -> cierre`

### PRODUCT EVOLUTION
Para UX/UI, Cliente, Coach, Admin, IRI, planificación, sesiones, feedback, progreso, PWA, i18n, rendimiento e inteligencia asistiva.

`Canary vigente -> rama pequeña -> tests -> PR -> Canary -> QA/gates -> lote reversible -> producción`

## Prioridades

- P0: seguridad, privacidad, corrupción/pérdida de datos, cross-tenant, bypass auth/RLS/WebAuthn, indisponibilidad crítica.
- P1: bloqueo de operación/usuario, fallo de release gate, evidencia multidispositivo insuficiente en rutas críticas, gobernanza que pueda provocar releases incorrectos.
- P2: UX/UI, accesibilidad, rendimiento, observabilidad y mantenibilidad.
- P3: refinamientos menores.

## Contratos canónicos

- Operación ChatGPT: `docs/CHATGPT_WORKFLOW.md`.
- Producto: `docs/PRODUCT.md`.
- Diseño: `DESIGN.md`.
- Definition of Done: `docs/DEFINITION_OF_DONE.md`.
- Estado: `docs/PRODUCTION_STATE.md`.
- Operating model: `docs/OPERATING_MODEL.md`.
- Release: `docs/RELEASE_POLICY.md` y `docs/PRODUCTION_PROMOTION_RUNBOOK.md`.
- Decisiones duraderas: `docs/DECISIONS.md`.
- Prioridades: `docs/BACKLOG.md`.

Los documentos RC históricos son evidencia y contexto; no deben competir con estos contratos como fuente de verdad duradera.

## Dirección de producto

IBERFIT debe reforzar:
- diagnóstico IRI como baseline;
- planificación con criterio;
- control de carga;
- sesión y feedback;
- adherencia;
- progreso longitudinal;
- siguiente acción clara;
- operación escalable para Coach/Admin.

Regla de moat:
`señal -> decisión Coach -> intervención -> outcome -> aprendizaje -> siguiente decisión`.

## Experiencia por dispositivo

No aceptar como suficiente “desktop/tablet/móvil = mismas tarjetas con menos columnas”.

- desktop = analizar y construir;
- tablet = entrenar y operar;
- móvil = actuar y completar.

Las rutas críticas deben certificarse por tarea y dispositivo, no sólo por viewport.

## Flujo esperado para ChatGPT

1. Leer `AGENTS.md`.
2. Cargar contexto mínimo progresivo según `docs/CHATGPT_WORKFLOW.md`.
3. Verificar SHA/LIVE/Canary/CI si toca código, infraestructura o release.
4. Elegir carril y mantener WIP = 1.
5. Obtener evidencia antes de especular.
6. Implementar el cambio mínimo completo.
7. Ejecutar gates proporcionales.
8. Revisar diff, privacidad, seguridad y regresiones.
9. Verificar runtime real cuando corresponda.
10. Cerrar sólo según `docs/DEFINITION_OF_DONE.md`.
11. Actualizar STATE/BACKLOG/DECISIONS únicamente si cambió su verdad.
12. Continuar con la siguiente tarea prioritaria segura.

## Stop conditions

Abortar antes de mutar si:
- cambió inesperadamente el SHA base;
- aparece un secreto;
- una tarea QA toca PROD sin autorización;
- se requiere migration/RLS no prevista;
- falla un gate de seguridad;
- no existe rollback razonable;
- el cambio se vuelve destructivo o irreversible;
- hace falta una decisión empresarial real del usuario.

Ver `docs/CHATGPT_WORKFLOW.md`, `docs/DEFINITION_OF_DONE.md`, `docs/RELEASE_POLICY.md` y `docs/OPERATING_MODEL.md`.
