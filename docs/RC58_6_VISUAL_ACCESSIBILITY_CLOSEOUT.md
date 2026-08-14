# RC58.6 — Visual Accessibility Closeout

RC58_6_VISUAL_ACCESSIBILITY_CLOSEOUT=PASS
BASE=8911e0ee792af09634ff6bfe91193351a1e45551
SCOPE=APP_VISUAL_ACCESSIBILITY_ONLY

## Objetivo

Cerrar RC58 con una revisión transversal de accesibilidad visual sin modificar
lógica de negocio, autorización, datos, Supabase, canary remoto ni producción.

## Hallazgos corregidos

- La navegación inferior del Cliente ya no suprime `outline` en `:focus-visible`.
- Los botones del menú secundario del Cliente conservan foco de teclado explícito.
- Los controles del temporizador IRI suben al target canónico mínimo de 44 px.
- Los botones de la toolbar y del estado de error del informe IRI usan target mínimo de 44 px.
- Los controles independientes del informe IRI reciben foco visible explícito.
- Las superficies corregidas conservan foco en `forced-colors`.
- El Service Worker avanza a `m26-rc58-6` para invalidar el shell RC58.5C-B.

## Hallazgos clasificados sin parche

El discovery también detectó dimensiones inferiores a 44 px que no son targets
interactivos: líneas de 1 px, iconos, indicadores visuales, puntos de timeline,
badges y estados informativos. No se inflan porque hacerlo degradaría jerarquía
visual sin aportar accesibilidad.

`[data-wearable-status]` conserva `min-height:24px` porque es un estado informativo,
no un control.

`.m26-card-action` conserva su altura porque es un `span` visual dentro de un botón
que ya envuelve la tarjeta completa.

Los colores fijos del PDF/informe impreso no se migran masivamente en este gate:
forman parte de una composición de impresión y requieren una revisión específica
de fidelidad antes de sustituirse por tokens.

## Movimiento y responsive

Las coberturas existentes de `prefers-reduced-motion` se preservan.
Safe areas, viewport, responsive RC42, navegación RC39 y role surfaces permanecen
bajo sus contratos previos.

## Seguridad y alcance

BUSINESS_LOGIC_CHANGED=FALSE
AUTHORIZATION_CHANGED=FALSE
DATA_MODEL_CHANGED=FALSE
RUNTIME_DEPENDENCIES_ADDED=ZERO
PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

## Cache PWA

PWA_CACHE_VERSION=m26-rc58-6
PWA_PREVIOUS_CACHE_VERSION=m26-rc58-5c-b

El bump es obligatorio porque RC58.6 modifica CSS precacheado. Mantener el nombre
anterior podría dejar estilos antiguos en instalaciones existentes.

## Gates

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC58_6_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

## Cierre

RC58=CLOSED
NEXT_PRODUCT_ACTION=RC59_0_CANONICAL_TELEMETRY_TIMELINE
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY