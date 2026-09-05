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

- LIVE SUPPORT / HOTFIX nace del deployment/SHA LIVE exacto recuperado para la intervención y contiene el parche mínimo.
- PRODUCT EVOLUTION nace del Canary certificado y agrupa mejoras planificadas.

Después de un hotfix productivo, el cambio se reconcilia con la línea de evolución.

## D-009 · No promover diferencias masivas por inercia

Estado: vigente desde 2026-09-02

Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`.

Un SHA frontend LIVE observado históricamente no sustituye la identidad actual del deployment de proveedor. La promoción se hará por lotes funcionales, recertificados y reversibles después de recuperar el deployment productivo real y calcular el diff exacto.

La existencia de un Canary verde no basta para promover toda la diferencia.

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

El SHA `9cbe3ad29dfda0a552aa54c7e1404575b96786d4` quedó certificado en Canary con remote gate `33641163059` = success, sin mutaciones de producción durante esa certificación y sin tocar dominios productivos. Se conserva como base de evolución hasta que una nueva tarea mueva Canary mediante el mismo rigor.

## D-014 · El bundle SQL histórico 33656032685 queda retirado

Estado: vigente desde 2026-09-02

Producción `pjhmrhejsoofmouedavw` fue inspeccionada en modo read-only. El preflight del artifact `final-production-promotion-sql` del run `33656032685` falló fail-closed porque esperaba un baseline anterior.

La historia de migraciones productiva demuestra que RC74.4/RC65/P0 ya fueron aplicados, incluyendo `final_prod_01...final_prod_16` y migraciones posteriores hasta al menos `20260902033214 p0_restore_primary_auth_read_bootstrap_v1`.

Por tanto:

- el bundle queda `SUPERSEDED`;
- no se ejecuta;
- no se modifica el baseline productivo para hacerlo pasar;
- no se reejecutan migraciones registradas;
- cualquier cambio DB futuro parte del estado live y contiene sólo el delta faltante.

PR #43 se cerró sin merge después de retirar su camino de mutación y dejar la evidencia verificable.

## D-015 · La identidad del frontend productivo viene del proveedor

Estado: vigente desde 2026-09-02

Antes de cualquier deploy frontend productivo se deben recuperar de Cloudflare el proyecto Pages exacto, deployment ID live, dominios/rutas y deployment de rollback.

No se permite inferir esa identidad desde:

- nombres de repositorio;
- ramas históricas;
- nombres de proyectos Canary;
- SHAs observados en sesiones anteriores;
- scripts de deploy antiguos.

Si la evidencia de proveedor no está disponible, la promoción frontend queda bloqueada y Canary no se mueve por conveniencia.

## D-016 · No redeployar componentes productivos que ya cumplen por rutina

Estado: vigente desde 2026-09-02

La Edge Function `iberfit-webauthn-v1` está observada ACTIVE v1, `verify_jwt=true`, con contrato productivo visible coherente con el release certificado. No se redeploya sólo para “sincronizar”. Una mutación necesita una diferencia real demostrada, checkpoint de versión y rollback independiente.

## Decisiones pendientes

### P-D01 · Visibilidad del repositorio

La configuración observada es pública, mientras documentación histórica decía que debía ser privada. Resolver explícitamente considerando seguridad, secretos (que nunca deben existir en Git independientemente de visibilidad), colaboración y estrategia open-source. No cambiar automáticamente.

### P-D02 · Primer lote de promoción frontend

Recuperar primero el proyecto/deployment Cloudflare productivo exacto. Después calcular el diff contra `9cbe3ad...`, definir alcance, riesgo, tests y rollback. No desplegar durante el inventario.

### P-D03 · Repositorio web canónico

`iberfit/iberfit-web` está archivado. `iberfit/iberfitweb` permanece activo, pero su `main` conocido no coincide con `iberfit.cl` LIVE. Recuperar la fuente real del deploy LIVE antes de declarar el repositorio/rama definitivos.
