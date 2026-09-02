# IBERFIT · Decision Register

Registrar aquí sólo decisiones duraderas. No usar como diario de commits.

## D-001 · Repositorio técnico canónico

Estado: vigente

`iberfit/iberfit-m26-app` es la fuente técnica canónica de la aplicación M26. Repositorios históricos no deben introducir código de vuelta sin comparación explícita.

## D-002 · Producción congelada por defecto

Estado: vigente

Ninguna rama de trabajo, auditoría, refactor o mejora autoriza por sí sola un despliegue. Producción sólo cambia después de gates, evidencia del artefacto exacto, revisión de seguridad y rollback.

## D-003 · Separación Cliente / Coach / Admin

Estado: vigente

Los roles comparten Design System y contratos cuando conviene, pero no permisos implícitos. La UI nunca sustituye al control backend/RLS.

## D-004 · Inteligencia IBERFIT asistiva

Estado: vigente

La IA puede proponer, resumir, priorizar y detectar; el Coach revisa y decide en decisiones de entrenamiento relevantes.

## D-005 · Fuente de verdad fuera del chat

Estado: vigente desde 2026-09-02

El conocimiento estable se mantiene en `AGENTS.md` y `docs/`. Los hilos de ChatGPT son interfaz de dirección y contexto, no la única memoria del proyecto.

## D-006 · Desarrollo sobre rama segura

Estado: vigente

Trabajo de consolidación documental iniciado en `chore/iberfit-hq-bootstrap`, derivada del Canary SHA `444374e0c6cc6efb1d95f00dc7b138f261a23187`. No toca `main`, PROD ni Supabase PROD.

## D-007 · App, web y growth como carriles coordinados

Estado: vigente

IBERFIT se gestiona en tres carriles: Producto/App, Website/CRO/SEO y Growth/Sales. Comparten objetivos y métricas, pero no deben confundir repositorios, entornos o deploys.

## Decisiones pendientes

### P-D01 · Visibilidad del repositorio

La configuración observada es pública, mientras documentación histórica decía que debía ser privada. Resolver explícitamente considerando seguridad, secretos (que nunca deben existir en Git independientemente de visibilidad), colaboración y estrategia open-source. No cambiar automáticamente.

### P-D02 · Próxima línea de candidato

Hay PRs abiertos parcialmente solapados. Elegir una línea única después de comparar `canary/rc74-4`, `prep/final-production-rc74-4` y PR #38. Evitar merges acumulativos sin análisis.

### P-D03 · Repositorio web canónico

Evidencia histórica propone `iberfit/iberfitweb` como web oficial y `iberfit/iberfit-web` como duplicado histórico. Revalidar estado remoto/live antes de consolidarlo como decisión actual.
