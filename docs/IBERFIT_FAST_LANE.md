# IBERFIT · Fast Lane de cambios

Objetivo operativo: que una mejora normal de frontend, UX, lógica o bugfix llegue desde petición hasta producción verificada con un presupuesto estándar inferior a 10 minutos cuando los servicios externos responden con normalidad.

## Principios

1. Una petición se ejecuta de extremo a extremo: localizar -> implementar -> test dirigido -> gates -> merge -> promoción -> smoke LIVE.
2. No se reaudita lo que ya está GREEN salvo impacto directo o evidencia nueva.
3. Los tests dirigidos se ejecutan antes que la regresión completa para obtener diagnóstico rápido.
4. CI, auditoría continua y Fast Lane son paralelos; ninguno sustituye los gates de seguridad.
5. Nunca se debilitan RLS, ABAC, WebAuthn, fail-closed, separación QA/PROD ni prohibición de service-role.
6. Una PR contiene un único objetivo. Deuda o releases posteriores se separan en otra rama/PR.
7. Los artefactos generados deterministas se verifican antes de gastar tiempo en la suite completa.

## Pipeline

`cambio -> fast-lane targeted preflight -> CI + Continuous App Audit -> merge canary/rc74-4 -> gates post-merge -> production-promote -> smoke app.iberfit.cl`

### Fast Lane

Workflow: `.github/workflows/fast-lane.yml`.
Runner: `scripts/fast_lane_affected_tests.mjs`.

El runner:

- calcula el diff exacto base...head;
- selecciona tests según archivos afectados;
- verifica inmediatamente el contrato PWA app-shell cuando cambia `src/m26/**` o `public/m26/**`;
- si el app-shell está stale, regenera el checkout efímero y muestra el diff exacto requerido sin commitear nada;
- imprime el comando que falla y conserva `recovery/fast-lane/summary.json`;
- no reemplaza `npm test` ni los gates de promoción.

## Presupuesto de tiempo objetivo

- 0–1 min: SHA + archivos afectados.
- 1–3 min: cambio completo.
- 3–4 min: Fast Lane.
- 4–8 min: CI + Continuous App Audit en paralelo.
- 8–9 min: merge e integración.
- 9–10 min: promoción y smoke, cuando no existe dependencia externa lenta.

Si un proveedor externo o un gate de seguridad impide el objetivo, se mantiene fail-closed y se diagnostica el bloqueo exacto; nunca se salta el gate para cumplir tiempo.

## Mapa inicial de tests afectados

- `src/m26/shell/**` -> shell roles, route/navigation, RC75.
- `coach-productivity.js` -> RC60.1 + RC75.
- `native-workspace.js`, preferencias e i18n -> RC71.2 + RC75.
- `src/m26/admin/**` -> RC40 + RC75.
- route render/view-model -> navegación cliente + contrato de rutas.
- cualquier cambio `src/m26/**` o `public/m26/**` -> contrato determinista PWA app-shell.

El mapa debe ampliarse cuando aparezcan nuevos módulos, sin convertir Fast Lane en una segunda suite completa.

## Limpieza del repositorio

- `canary/rc74-4` es la única rama de integración canónica.
- ramas de feature/release sólo se eliminan cuando están absorbidas y no son necesarias para auditoría o rollback;
- no se hace force-push;
- no se borra evidencia de producción ni referencias de rollback;
- la rama por defecto de GitHub debe apuntar a la línea canónica vigente para que búsquedas y automatizaciones no usen snapshots históricos.
