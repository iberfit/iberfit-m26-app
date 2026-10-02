# IBERFIT · Decision Register

Registrar sólo decisiones duraderas.

## D-001 · Repositorio técnico canónico
`iberfit/iberfit-m26-app` es la fuente técnica canónica.

## D-002 · Producción protegida por defecto
`app.iberfit.cl` es producción real. Ningún cambio llega a LIVE sólo por existir en Canary.

## D-003 · Separación Cliente / Coach / Admin
Compartir Design System no implica compartir permisos. Backend/RLS siguen siendo autoridad.

## D-004 · Inteligencia asistiva
La Inteligencia IBERFIT puede preparar, resumir, priorizar y proponer. El Coach decide las intervenciones relevantes.

## D-005 · Fuente de verdad fuera del chat
Estado estable en `AGENTS.md` y `docs/`.

## D-006 · HQ integrado en la línea técnica
Desde 2026-09-13, HQ no debe permanecer aislado en una rama documental histórica. STATE/BACKLOG/operating/release/decisions deben acompañar Canary.

## D-007 · App, web y growth son carriles coordinados
No mezclar repositorios/deploys.

## D-008 · Hotfix LIVE y evolución separados
P0/P1 LIVE nace del source LIVE exacto. Product Evolution nace de Canary.

## D-009 · Promoción por lote verificable
No promover por inercia. Cada release tiene source SHA exacto, gates, preflight, rollback y verificación post-deploy.

## D-010 · Paralelizar análisis, serializar riesgo
Deploys PROD, auth/RLS/DB/DNS y merges de release se serializan.

## D-011 · Feedback en lenguaje natural
El propietario no necesita tickets técnicos; el agente convierte observaciones en trabajo verificable.

## D-012 · Bundle SQL histórico retirado
`33656032685` = SUPERSEDED. No ejecutar ni adaptar.

## D-013 · No redeployar componentes productivos por rutina
Sólo con diferencia real demostrada y rollback.

## D-014 · Producción productiva identificada por workflow
Checkpoint 2026-09-13: source SHA `6d06d033fe09b6802bef21e0f30374b48c78edda`, promotion run `34776097179` SUCCESS, proyecto Pages `iberfit-m26-production`.

## D-015 · Experiencia por dispositivo es semántica
desktop = analizar/construir; tablet = entrenar/operar; móvil = actuar/completar. Reducir columnas no constituye por sí solo adaptación.

## D-016 · Outcome loop como moat
Priorizar `señal -> decisión Coach -> intervención -> outcome -> aprendizaje` antes de features genéricas.

## D-017 · Persistencia operativa obligatoria
Ninguna implementación material o decisión duradera puede quedar sólo en el chat. Código, estado, decisiones y evidencia deben persistir en Git/PR y contratos canónicos. Un WIP interrumpido debe dejar HEAD exacto, nivel de verificación y siguiente acción.

## D-018 · IRI baseline y evolución separados
El IRI es baseline inicial. Seguimiento y reevaluación longitudinal no deben modelarse como nuevas instancias equivalentes del IRI inicial.

## D-019 · Fotogrametría como evidencia privada no diagnóstica
Originales y derivados se separan; originales se protegen de mutación indebida; landmarks requieren validación del Coach; las fotos se excluyen de reportes por defecto y la fotogrametría no emite diagnóstico automático.

## D-020 · Disciplina de coste
IBERFIT prioriza soluciones gratuitas suficientes. No introducir servicios de pago, upgrades o pruebas de pago sin decisión empresarial explícita.

## Decisiones pendientes

### P-D01 · Protección de Canary
`canary/rc74-4` sigue sin protección a 2026-09-13. Requiere política de PR/checks obligatorios.

### P-D02 · Visibilidad del repositorio
Resolver explícitamente; no cambiar automáticamente.
