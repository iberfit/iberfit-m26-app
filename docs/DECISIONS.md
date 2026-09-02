# IBERFIT · Decision Register

Registrar aquí sólo decisiones duraderas. No usar como diario de commits.

## D-001 · Repositorio técnico canónico

Estado: vigente

`iberfit/iberfit-m26-app` es la fuente técnica canónica de la aplicación M26. Repositorios históricos no deben introducir código de vuelta sin comparación explícita.

## D-002 · Producción protegida por defecto

Estado: vigente

`app.iberfit.cl` es producción real con usuarios reales. Ninguna rama de trabajo, auditoría, refactor o mejora autoriza por sí sola un despliegue. Producción sólo cambia después de gates, evidencia del artefacto exacto, revisión de seguridad y rollback.

## D-003 · Separación Cliente / Coach / Admin

Estado: vigente

Los roles comparten Design System y contratos cuando conviene, pero no permisos implícitos. La UI nunca sustituye al control backend/RLS.

## D-004 · Inteligencia IBERFIT asistiva

Estado: vigente

La IA puede proponer, resumir, priorizar y detectar; el Coach revisa y decide en decisiones de entrenamiento relevantes.

## D-005 · Fuente de verdad fuera del chat

Estado: vigente desde 2026-09-02

El conocimiento estable se mantiene en `AGENTS.md` y `docs/`. Los hilos de ChatGPT son interfaz de dirección y contexto, no la única memoria del proyecto.

## D-006 · Desarrollo sobre ramas seguras

Estado: vigente

La consolidación documental vive en `chore/iberfit-hq-bootstrap`. El código funcional se modifica en ramas de tarea derivadas de la base correcta. No tocar `main`, PROD ni Supabase PROD por conveniencia.

## D-007 · App, web y growth como carriles coordinados

Estado: vigente

IBERFIT se gestiona en carriles coordinados: Live Support, Product/App, Website, Growth/Sales y QA/Security. Comparten objetivos y métricas, pero no deben confundir repositorios, entornos o deploys.

## D-008 · Dos líneas de código: hotfix LIVE y evolución

Estado: vigente desde 2026-09-02

Un bug P0/P1 de usuarios reales no debe resolverse arrastrando automáticamente todo Canary.

- LIVE SUPPORT / HOTFIX nace del SHA LIVE exacto y contiene el parche mínimo.
- PRODUCT EVOLUTION nace del Canary certificado y agrupa mejoras planificadas.

Después de un hotfix productivo, el cambio se reconcilia con la línea de evolución.

## D-009 · No promover 43 commits de una vez

Estado: vigente desde 2026-09-02

Checkpoint verificado:

- LIVE `cb423a12402206a383d4174a168707b2d860c023`;
- Canary certificado `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`;
- diferencia: Canary +43 commits.

La promoción se hará por lotes funcionales, recertificados y reversibles. La existencia de un Canary verde no basta para promover toda la diferencia.

## D-010 · Paralelizar análisis, serializar riesgo

Estado: vigente

Pueden avanzar en paralelo investigación, auditoría read-only, producto, web, growth, UX y documentación. Las mutaciones de alto riesgo (deploy PROD, migration, RLS/auth, DNS, grandes merges) se serializan y usan checkpoint exacto.

## D-011 · ChatGPT Desktop como centro de dirección; Codex como fábrica

Estado: vigente

El propietario trabajará habitualmente desde la aplicación de escritorio.

- ChatGPT/IBERFIT HQ: dudas, estrategia, triage, producto, decisiones y Growth.
- Codex: implementación real sobre repositorio, tests, diffs y preparación de candidatos.
- GitHub/docs: memoria permanente.

El objetivo es minimizar relecturas, logs pegados y contexto mensual desperdiciado. Ver `docs/CODEX_WORKFLOW.md`.

## D-012 · Feedback en lenguaje natural

Estado: vigente

El propietario no necesita redactar tickets técnicos. Puede describir lo que ve o siente al usar `app.iberfit.cl`; el agente lo clasifica, investiga y convierte en un cambio verificable. No toda duda se convierte automáticamente en código.

## D-013 · Canary exacto certificado

Estado: vigente como checkpoint, no como alias permanente

El SHA `9cbe3ad29dfda0a552aa54c7e1404575b96786d4` quedó certificado en Canary con remote gate `33641163059` = success, 0 mutaciones Supabase PROD y sin tocar dominios productivos. Se conserva como base de evolución hasta que una nueva tarea mueva Canary mediante el mismo rigor.

## Decisiones pendientes

### P-D01 · Visibilidad del repositorio

La configuración observada es pública, mientras documentación histórica decía que debía ser privada. Resolver explícitamente considerando seguridad, secretos (que nunca deben existir en Git independientemente de visibilidad), colaboración y estrategia open-source. No cambiar automáticamente.

### P-D02 · Release train LIVE → Canary

Convertir los 43 commits actuales en lotes de promoción con alcance, riesgo, tests, migraciones y rollback. No desplegar durante el inventario.

### P-D03 · Repositorio web canónico

`iberfit/iberfit-web` está archivado. `iberfit/iberfitweb` permanece activo, pero su `main` conocido no coincide con `iberfit.cl` LIVE. Recuperar la fuente real del deploy LIVE antes de declarar el repositorio/rama definitivos.
