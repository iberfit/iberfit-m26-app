# RC58.5C-B — App-wide Functional Integrity

RC58_5C_B_STATUS=IMPLEMENTED
RC58_5C_B_SCOPE=APP_ONLY
BASE=e02274f5f7d10d3897e6661fdd668d3a6026d2f3
COMMERCIAL_WEB_TOUCHED=FALSE

## Objetivo

Cerrar las deficiencias funcionales transversales detectadas después del saneamiento
de encoding RC58.5C-A.

## Encoding gate self-reference

El informe histórico de RC58.5C-A contenía ejemplos literales de las firmas de
mojibake que el gate permanente debe rechazar. Como ese archivo era nuevo, todavía
no aparecía en `git ls-files` durante su primera ejecución. RC58.5C-B elimina esas
firmas del propio informe y mantiene el escaneo global sin whitelist ni exclusiones.

ENCODING_REPORT_SELF_REFERENCE_REPAIR=PASS
ENCODING_GUARD_EXCLUSIONS_ADDED=FALSE

## Password recovery production

La recuperación deja de estar hardcodeada a canary.

Reglas:

- canary QA conserva redirect exclusivo a `m26-canary.iberfit.cl`;
- producción usa únicamente el mismo host autorizado que ejecuta la app;
- `app.iberfit.cl` queda habilitado;
- `coach.iberfit.cl` conserva compatibilidad solo cuando la aplicación está
  ejecutándose realmente en ese mismo host;
- no se permiten redirects cross-host;
- localhost mantiene soporte de desarrollo same-host;
- el mensaje público no revela si una cuenta existe;
- update-password production usa el mismo flujo de fragment scrub ya existente.

PASSWORD_RECOVERY_PRODUCTION=PASS
RECOVERY_REDIRECT_POLICY=SAME_HOST

## PWA coherence

El Service Worker deja de depender de una lista manual que vuelve a quedar obsoleta.

`scripts/generate_rc58_app_shell.mjs` deriva el shell desde los archivos rastreados
de la app y tiene modo `--check`.

Incluye JS/CSS M26, HTML, fuentes, manifest, iconos y assets estáticos requeridos.

Nunca precachea:

- `runtime-config.js`;
- `runtime-config.example.js`;
- `sw.js`;
- auth/API/RPC/functions.

PWA_PRECACHE_GENERATOR=PASS
PWA_RUNTIME_CONFIG_CACHED=FALSE

## Compatibilidad de contrato RC58.5B

El test heredado de identidad nativa se mantiene como regresión obligatoria.
RC58.5C-B actualiza únicamente las expectativas de versión y alcance de appIcons
porque Brand Truth pasa de identidad nativa a identidad nativa + PWA.
Las aserciones Phone, Wear, launcher, monochrome y vector master permanecen intactas.

RC58_5B_NATIVE_IDENTITY_REGRESSION_ALIGNED=PASS

## Compatibilidad de contrato RC42

RC42 sigue exigiendo que `/src/m26/rc42/rc42.css` forme parte del precache.
RC58.5C-B cambia la representación del `APP_SHELL` desde una lista manual con
comillas simples a JSON determinista con comillas dobles. El test heredado se
vuelve neutral a esa representación y mantiene intacta la garantía funcional.

RC42_RESPONSIVE_PRECACHE_SEMANTIC_REGRESSION=PASS
RC42_PRECACHE_REQUIREMENT_WEAKENED=FALSE

## PWA Brand Truth

Los iconos 192/512, maskable y Apple Touch se derivan del isotipo oficial.

El artwork interno no se recolorea.

PWA_BRAND_IDENTITY=ALIGNED

## Offline

El fallback offline usa:

- Brand Truth;
- tokens RC58;
- Inter;
- Source Serif 4;
- focus visible;
- touch target canónico.

OFFLINE_DESIGN_SYSTEM_ALIGNMENT=PASS

## CI

`feature/rc58-design-system` obtiene gate propio.

El gate verifica:

- encoding;
- app shell determinista;
- suite completa de tests.

CI_RC58_BRANCH_AWARE=TRUE

## Scope

La web comercial queda diferida hasta completar la aplicación.

COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

## Pendientes deliberados

No se ocultan:

- SR0 threat model;
- RLS negative tests y Admin organizational read-model;
- session token browser threat model;
- privacy/retention de datos offline;
- supply-chain security;
- BLE HRS physical E2E cuando exista hardware;
- release/cutover inventory de `app.iberfit.cl`.

RC58_5C_B_APP_WIDE_FUNCTIONAL_INTEGRITY=PASS
FULL_APP_TEST_SUITE_REQUIRED=TRUE
PHONE_WEAR_COMPILE_REQUIRED=TRUE

NEXT_ACTION=RC58_6_VISUAL_ACCESSIBILITY_CLOSEOUT
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY