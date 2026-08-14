# RC58.2 — Icon + Typography System

RC58_2_STATUS=IMPLEMENTED
RC58_2_LUCIDE_VERSION=1.27.0
RC58_2_INTER_FONTSOURCE_PACKAGE=5.3.0
RC58_2_SOURCE_SERIF_4_FONTSOURCE_PACKAGE=5.3.0

## Decisión

RC58.2 convierte tipografía e iconografía en infraestructura local de producto.

No se usa CDN en runtime.

Los assets de fuente se obtienen una sola vez desde paquetes Fontsource exactos mediante `npm pack --ignore-scripts`, se validan como paquetes sin dependencias/runtime install hooks y se copian al repositorio.

La aplicación sirve después esos WOFF2 desde IBERFIT.

## Tipografía

Inter Variable:
- interfaz;
- formularios;
- tablas;
- navegación;
- métricas;
- controles.

Source Serif 4 Variable:
- títulos editoriales;
- informes;
- narrativa;
- jerarquía premium selectiva.

No se usa la serif como tipografía operativa de alta densidad.

Solo se precarga Inter. Source Serif 4 se carga cuando el navegador la necesita.

## Iconografía

La geometría del registry inicial procede de Lucide 1.27.0.

El registry es local, sin CDN y sin ejecución de código de terceros.

Cada icono de navegación acompaña una etiqueta textual: el icono es decorativo y conserva `aria-hidden=true`.

Los icon-only controls futuros deberán proporcionar `label`.

## Seguridad / SR6

- versiones exactas;
- Fontsource package acquisition con `npm pack --ignore-scripts`;
- cero dependencias en los paquetes de fuentes seleccionados;
- rechazo de preinstall/install/postinstall hooks;
- assets servidos desde mismo origen;
- sin `@import` remoto;
- sin scripts CDN;
- licencia/provenance conservadas;
- Lucide registry estático y auditado contra script/event handlers/external href.

## Alcance visual

RC58.2 mejora navegación y jerarquía tipográfica, pero no intenta rediseñar aún cards/forms/dialogs completos.

Los primitives son RC58.3.

## Cierre

RC58_2_SELF_HOSTED_INTER=PASS
RC58_2_SELF_HOSTED_SOURCE_SERIF_4=PASS
RC58_2_LOCAL_LUCIDE_REGISTRY=PASS
RC58_2_NAVIGATION_ICONOGRAPHY=PASS
RC58_2_ACCESSIBLE_ICON_CONTRACT=PASS
RC58_2_RUNTIME_CDN_DEPENDENCY=FALSE
RC58_2_LICENSE_PROVENANCE=PASS
RC58_2_PHONE_COMPILE=PASS
RC58_2_WEAR_COMPILE=PASS

NEXT_ACTION=RC58_3_CORE_PRIMITIVES
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY