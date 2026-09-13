# IBERFIT Agent Operating Contract

Este repositorio es la fuente de verdad técnica de IBERFIT M26. Los chats, documentos históricos y ramas antiguas son contexto auxiliar, nunca autoridad superior al estado verificable del repositorio, CI, Canary y producción.

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
- la Inteligencia IBERFIT prepara, resume y propone; el Coach conserva la decisión profesional.

## Checkpoint verificado · 2026-09-13

- Producción `app.iberfit.cl`: source SHA `6d06d033fe09b6802bef21e0f30374b48c78edda`.
- Rama fuente de producción: `canary/rc74-4`.
- PR #323: merged.
- Promotion run: `34776097179` = SUCCESS.
- Proyecto Cloudflare productivo: `iberfit-m26-production`.
- Preflight, deploy Wrangler, verificación exacta de identidad, browser smoke y auditoría integral post-deploy: SUCCESS.
- P0 técnico demostrado: 0.
- `canary/rc74-4` sigue sin protección de rama a este checkpoint.

Los SHA son checkpoints, no alias permanentes. Volver a leer rama/LIVE antes de mutar.

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

## Flujo esperado para agentes

1. Leer `AGENTS.md`.
2. Leer `docs/PRODUCTION_STATE.md`.
3. Leer `docs/OPERATING_MODEL.md` y sólo documentos del dominio afectado.
4. Verificar SHA/LIVE/Canary/CI si toca código o release.
5. Elegir carril.
6. Implementar el cambio mínimo suficiente.
7. Ejecutar gates proporcionales.
8. Revisar diff, privacidad y regresiones.
9. Actualizar STATE/BACKLOG si cambia estado/prioridad.
10. Actualizar DECISIONS sólo para decisiones duraderas.

## Stop conditions

Abortar antes de mutar si:
- cambió inesperadamente el SHA base;
- aparece un secreto;
- una tarea QA toca PROD sin autorización;
- se requiere migration/RLS no prevista;
- falla un gate de seguridad;
- no existe rollback razonable.

Ver `docs/RELEASE_POLICY.md`, `docs/OPERATING_MODEL.md` y `docs/CODEX_WORKFLOW.md`.
