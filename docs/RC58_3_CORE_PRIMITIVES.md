# RC58.3 â€” Core Primitives

RC58_3_STATUS=IMPLEMENTED
RC58_3_STRATEGY=COMPATIBILITY_FIRST
RC58_3_BUSINESS_LOGIC_DUPLICATED=FALSE

## Objetivo

Crear primitives visuales reutilizables sin reescribir mÃ³dulos funcionales que ya existen.

RC58.3 no reemplaza los flujos Cliente, Coach, Admin, sesiÃ³n, wearables, engagement o publicaciÃ³n. La capa nueva se monta encima del producto existente y adopta explÃ­citamente selectores legacy como superficies compatibles.

## Primitives

Foundation:

- Button / IconButton / Link
- Field / Input / Textarea / Select
- Checkbox / Radio / Switch
- Badge / Chip
- Card / Panel
- Metric / KPI
- Alert / Notice / Toast
- Skeleton
- Empty / Error / Retry / Offline / Sync states
- Tooltip / Popover
- Dialog / Sheet
- Tabs / SegmentedControl
- Progress
- TableShell
- FilterBar / SearchField

## Compatibilidad

`src/m26/design/primitives.css` se carga al final de la cascada de estilos M26.

No borra CSS histÃ³rico todavÃ­a.

Los componentes genÃ©ricos ya existentes (`m26-panel`, `m26-stat`, `m26-list-card`, `m26-client-card`, `m26-library-card`, `m26-primary-action`, `m26-form-status`, etc.) convergen visualmente sobre tokens RC58.

Esto permite un salto visual sin perder comportamiento.

## Seguridad

La capa de primitives:

- no hace `fetch`;
- no toca Supabase;
- no usa localStorage/sessionStorage/IndexedDB;
- no define autorizaciÃ³n;
- no aÃ±ade handlers inline;
- no incorpora dependencia runtime nueva.

La autorizaciÃ³n sigue perteneciendo a las capas funcionales y a RLS/server-side boundaries.

## Accesibilidad

- touch target base de 44px;
- `focus-visible`;
- estados no dependen solo del color;
- reduced motion;
- high contrast;
- tabular numerals para mÃ©tricas;
- icon-only sigue requiriendo accessible name desde RC58.2.

## Regla de evoluciÃ³n

Primero compatibilidad, despuÃ©s migraciÃ³n.

RC58.4 puede aplicar densidades/jerarquÃ­as especÃ­ficas Cliente, Coach y Admin usando los primitives ya estabilizados.

No se reescriben mÃ³dulos simplemente para cambiar su estÃ©tica.

## Cierre

RC58_3_CORE_PRIMITIVES=PASS
RC58_3_LEGACY_COMPATIBILITY=PASS
RC58_3_BUSINESS_LOGIC_DUPLICATED=FALSE
RC58_3_NO_NEW_RUNTIME_DEPENDENCIES=PASS
RC58_3_ACCESSIBILITY_FOUNDATION=PASS
RC58_3_PRODUCT_STATES=PASS
RC58_3_SCOPE_MINIMUM_COMPLETE=TRUE
RC58_3_CANONICAL_PRIMITIVE_COUNT=35
RC58_3_COMPLETENESS_PATCH=RC58_3A

NEXT_ACTION=RC58_4_ROLE_SURFACES
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY