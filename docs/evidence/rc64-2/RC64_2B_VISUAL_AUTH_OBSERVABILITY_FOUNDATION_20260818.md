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
## Remote workflow indentation correction

After the RC64.2B1 foundation commit was pushed, independent remote inspection of
`.github/workflows/remote-gates.yml` found that the first appended RC64.2B step
(`Preparar Playwright RC64.2B`) had been written at YAML root indentation instead
of inside `jobs.preflight.steps`.

The remaining appended steps were already at the correct six-space step
indentation. V6 corrects only that structural defect and adds a regression that
rejects any top-level `- name:` action and requires every RC64.2B action to remain
inside the existing `preflight` step list.

No application source, performance budget, dependency, backend contract, secret,
or release-data path changes in this correction.
## Post-commit PWA inventory alignment

V6 correctly fixed the remote-workflow indentation and its focused tests passed,
but the subsequent full regression failed on `RC58_5C_B_APP_SHELL_STALE`.

The cause is deterministic: `src/m26/quality/runtime-observability.js` was still
a new/untracked file when the V5 pre-commit suite ran. RC58.5c-b intentionally
builds the broad `src/m26` JavaScript/CSS precache inventory from `git ls-files`.
After V5 committed the module, it became part of that tracked inventory and the
previously generated `APP_SHELL` was therefore stale.

V7 regenerates `public/m26/sw.js` from the definitive tracked inventory and adds
a regression requiring the quality-observability module in `APP_SHELL`.

The generator itself is unchanged, the RC58.5c-b fail-closed contract is not
weakened, and service-worker lineage remains `m26-rc63-2` with predecessor
`m26-rc63-1`.
## Linux CI historical-provenance checkout correction

The first V7 Linux CI run completed Playwright system dependency installation and
reached the full Node test suite. The only failure was RC56 hardware validation:
`la evidencia pertenece a los bridges exactos realmente probados`.

That test intentionally resolves both source paths at
`RC56_HARDWARE_VALIDATION.json.baseCommit`
`9d93330d23a6029bc742676bd5e5463f1e8360a3`.

Independent canonical GitHub verification confirms that commit contains:

- `native/android/wear/IBERFITWearHealthServicesBridge.kt` at blob
  `eaa4c1d2945d19d505351352672e1a3b54cf6a4c`;
- `native/android/runtime/IBERFITWearDataLayerRuntime.kt` at blob
  `5c5ac124bc65253cdc62e4c66649e20fbc3288fa`.

Those are exactly the `sourceGuards` stored in the RC56 physical-hardware
evidence. The failure therefore was not stale hardware evidence and not a product
regression. GitHub Actions used the default shallow `actions/checkout@v4`
history, while the developer repository used for the local gate had the complete
history.

CI now sets `fetch-depth: 0` on the canonical checkout. The RC56 test and hardware
evidence remain unchanged and fail-closed; RC64 adds a regression so shallow
checkout cannot silently be reintroduced while historical provenance is part of
`npm test`.
## Linux CI base-browser isolation correction

After the historical-provenance checkout correction, Linux CI passed the complete
Node suite (`1135` tests, `1134` pass, `0` fail, `1` intentional skip) and then
failed at `quality:rc64:browser`.

The base `playwright.config.mjs` still used the original broad
`testMatch:'**/*.spec.mjs'`. Once RC64.2A/2B added specialized specs under the
same `qa/rc64` directory, that base gate discovered `84` executions instead of
the canonical `75` synthetic-fixture executions. The extra nine were exactly
three specialized specs (`authenticated-smoke`, `real-shell`, `visual`) executed
under each of the base desktop/tablet/mobile projects.

This was orchestration leakage, not evidence that the specialized gates failed in
their intended environments:

- authenticated smoke requires the protected QA environment and its dedicated
  authenticated config;
- real-shell requires the generated current-source surface and dedicated server;
- visual regression requires the Linux-only visual config and generated
  current-source surface.

The base RC64.1 browser gate is now explicitly restricted to
`quality-platform.spec.mjs`. The three specialized configs/specs are unchanged.
A regression and a Playwright `--list` gate require exactly `75` tests in one
file and reject discovery of any specialized spec before commit.

This correction does not close RC64.2B and does not claim remote authenticated or
canonical Linux visual success. Those remain subject to the protected remote
workflow and evidence review.
## GitHub Linux Lighthouse sandbox compatibility correction

The post-V10 Linux CI run reached the final Quality Platform command with every
preceding gate green:

- Node suite: `1136` tests, `1135` pass, `0` fail, `1` intentional skip;
- base browser quality gate: `75/75` pass;
- current-source real-shell gate: `2/2` pass.

The runner was Ubuntu `24.04.4` (`ubuntu-24.04`, image
`20260810.271.1`). `quality:rc64:performance` built the canonical QA surface and
started the loopback static server successfully, but the directly spawned
Playwright Chromium executable aborted before Lighthouse run 1 with
`No usable sandbox!`.

This is distinct from a performance-budget failure: no Lighthouse metrics were
produced and no budget was evaluated. The direct `child_process.spawn` launcher
does not inherit Playwright's normal Chromium launch defaults.

The compatibility correction is intentionally narrow. A pure launch-policy module
adds `--no-sandbox` only when all of these are true:

1. platform is Linux;
2. `GITHUB_ACTIONS` is exactly `true`;
3. Lighthouse host is exactly IPv4 loopback `127.0.0.1`.

The policy returns no sandbox override on Windows, local/non-GitHub Linux, or any
other environment, and fails closed if GitHub Linux attempts to use a non-loopback
host. `run-lighthouse.mjs` separately asserts the canonical loopback host and
retains `--disable-background-networking`.

Budgets, run count, target, visual/authenticated gates, app source, backend and
clinical telemetry are unchanged. RC64.2B remains open until Linux CI is green
and the protected remote Linux visual/authenticated evidence has been reviewed.
