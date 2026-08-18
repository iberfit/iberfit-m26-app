# RC64.2B1 — Linux Visual, Authenticated Read-only Smoke & Runtime Observability Foundation

Fecha: 2026-08-18

## Estado de entrada

- RC64.1: CLOSED.
- RC64.2A: CLOSED.
- commit base: `6808979a603fdd2e45618230cfdee97a5a03a3a5`.
- RC64.2B: IN PROGRESS.

## Observabilidad de calidad

RC64.2B no reutiliza `iberfit.telemetry.v1` para RUM. Ese dominio contiene
identificadores de cliente/sesión y telemetría fisiológica y permanece separado.

`src/m26/quality/runtime-observability.js` define un colector independiente:

- `iberfit.quality-runtime-observability.v1`;
- memoria acotada;
- sin localStorage, IndexedDB, fetch ni transporte externo;
- sin email, userId, clientId, sessionId, FC, RR ni payload clínico;
- LCP y CLS como observación local;
- máxima latencia de interacción sólo como `candidate-not-inp`;
- diagnósticos limitados a `{stage, code, status}`;
- `fieldP75Claimed=false`;
- `inpClaimed=false`.

La instalación se difiere desde `public/m26/app.js` mediante `requestIdleCallback`
o fallback de timer y usa `PerformanceObserver` con `buffered:true`.

## Visual regression

Los baseline candidates se generan exclusivamente con Playwright/Chromium en
`ubuntu-latest`.

`playwright.visual.config.mjs` falla cerrado fuera de Linux. Se fijan desktop
1440x1000 y mobile 390x844 sobre la superficie QA actual, con locale `es-ES`,
zona `America/Santiago`, dark mode, reduced motion y service workers bloqueados.

En RC64.2B1 el workflow usa `--update-snapshots` sólo para producir el artefacto
candidato. No existe push automático ni permiso `contents: write`.

RC64.2B no se cerrará hasta revisar y versionar los PNG Linux aprobados y cambiar
el workflow a comparación estricta sin `--update-snapshots`.

## Authenticated read-only browser smoke

Se reutiliza el environment protegido `m26-canary-readonly`, pero no el reporte
histórico RC9 que expone identidad cruda.

`qa/rc64/build-authenticated-surface.mjs` reconstruye `.tmp/rc64-current-surface`
y sustituye únicamente su runtime config efímero con el proyecto canónico:

`https://pjhmrhejsoofmouedavw.supabase.co`.

No se escriben credenciales de usuario en el árbol QA. Email y contraseña sólo
se leen de GitHub Actions secrets dentro del proceso Playwright.

El browser smoke bloquea cualquier request externa no incluida en la allowlist.
Se permiten únicamente:

- login password de Supabase Auth;
- lectura del registry de comandos;
- RPC de bootstrap y extensiones explícitamente read-only usados por el hydrate
  inicial.

Cualquier PUT, PATCH, DELETE, command execute, telemetry import, draft upsert,
wearable mutation, admin execute u otra salida externa no enumerada se aborta
antes de llegar al backend y hace fallar el smoke.

La evidencia persistida contiene únicamente roles, contadores técnicos y flags
de privacidad; nunca email, token, userId, clientId, contraseña ni salud.

## Criterio de salida RC64.2B1

Localmente deben pasar:

- unit/regression target;
- suite completa;
- real-shell desktop/mobile;
- Lighthouse con budgets RC64.2A sin cambios.

Después el workflow remoto Linux debe producir:

1. PNG visuales canónicos candidatos;
2. evidencia authenticated-readonly browser PASS.

Sólo entonces procede RC64.2B2: aprobar/versionar goldens y convertir visual
regression a comparación estricta.
