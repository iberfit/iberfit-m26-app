# IBERFIT M26 — RC58 Design System

## Estado

RC58_SCOPE_STATUS=APPROVED
RC58_SCOPE_NAME=IBERFIT_DESIGN_SYSTEM
RC58_BASE_COMMIT=1d9074bae9f753d2f0cb8371468dba335506fbbc

RC58 inicia la fase de producto premium posterior al cierre de RC57.

Objetivo: construir un lenguaje visual y de interacción único para Cliente, Coach, Admin, shells Android y web comercial, sin acoplar el diseño a una librería concreta ni duplicar decisiones visuales entre superficies.

## Principio de producto

IBERFIT no debe parecer una colección de módulos funcionales. Debe sentirse como un único producto premium.

El lujo IBERFIT se define por:

- jerarquía clara;
- densidad correcta según rol;
- consistencia;
- velocidad percibida;
- feedback inmediato;
- ausencia de ruido visual;
- datos comprensibles;
- accesibilidad;
- detalle tipográfico;
- estados completos;
- cero interfaces falsas o decorativas que no funcionen.

## Arquitectura de tokens

RC58 tendrá una fuente canónica de tokens semánticos, independiente de plataforma.

Debe cubrir:

- color de marca;
- superficies;
- texto;
- bordes;
- estados;
- foco;
- espaciado;
- radios;
- elevación;
- tipografía;
- tamaños;
- breakpoints;
- densidad;
- z-index;
- motion duration/easing;
- data visualization palette;
- tamaños táctiles.

Los consumidores derivados podrán ser CSS custom properties y mappings nativos Android. No se duplicarán manualmente valores de marca en varias superficies.

## Tipografía

- Inter Variable: interfaz, navegación, formularios, tablas, métricas y controles.
- Source Serif 4: uso editorial selectivo, informes IRI, narrativa y piezas donde aporte jerarquía premium.
- No usar Source Serif 4 en controles densos o texto operativo.
- Fuentes autohospedadas.
- Licencia y provenance de cada asset deben quedar documentadas.
- Carga optimizada para evitar layout shift.

## Iconografía

Lucide será el sistema base de iconos.

Reglas:

- importación selectiva;
- tamaño y stroke definidos por tokens;
- iconos no sustituyen etiquetas cuando el significado pueda ser ambiguo;
- botones icon-only requieren nombre accesible;
- no mezclar familias visuales sin una excepción documentada.

## Component primitives

RC58 no termina en tokens. Debe crear primitives reutilizables.

Mínimo:

- Button
- IconButton
- Link
- Field
- Input
- Textarea
- Select
- Checkbox
- Radio
- Switch
- Badge
- Chip
- Card
- Panel
- Metric
- KPI
- Alert
- Notice
- Toast
- Skeleton
- EmptyState
- ErrorState
- RetryState
- OfflineState
- SyncState
- Tooltip
- Popover
- Dialog
- Sheet
- Tabs
- SegmentedControl
- Progress
- Table/List shell
- FilterBar
- SearchField

Floating-position infrastructure puede incorporarse en RC58 para Tooltip/Popover; RC62 la explotará para ayuda contextual.

## Roles y densidad

Los mismos primitives deben producir experiencias distintas sin convertirse en tres productos diferentes.

Cliente:
- lectura calmada;
- prioridad móvil;
- menos densidad;
- foco en siguiente acción y progreso.

Coach:
- densidad media-alta;
- comparaciones;
- filtros;
- operación rápida;
- teclado cuando aporte velocidad.

Admin:
- densidad alta;
- visión organizacional;
- tablas/listas amplias;
- estados y permisos explícitos.

## Estados de producto

Todo primitive interactivo debe contemplar cuando aplique:

- default;
- hover;
- focus-visible;
- pressed;
- selected;
- disabled;
- loading;
- success;
- warning;
- error;
- empty;
- retry;
- conflict;
- offline;
- syncing.

RC64 automatizará estos gates, pero RC58 debe construir accesibilidad y estados correctamente desde origen. No se aplaza accesibilidad hasta RC64.

## Accesibilidad

RC58 adopta WCAG 2.2 AA como baseline de diseño.

Además:

- target táctil IBERFIT recomendado de 44x44 CSS px para acciones principales;
- focus visible consistente;
- navegación por teclado;
- contraste semántico;
- no depender solo del color;
- orden de foco coherente;
- reduced motion preparado desde tokens;
- errores asociados a sus campos;
- nombres accesibles para icon buttons.

## Data visualization foundation

RC58 NO implementa ECharts todavía.

Sí define antes:

- paleta accesible de series;
- colores de positivo/negativo/neutro sin significado clínico automático;
- tipografía de ejes;
- formato de unidades;
- comportamiento de `Sin dato`;
- badges de calidad/procedencia;
- tooltips visuales;
- layout de cards de métricas.

Así RC59 puede introducir gráficos sin inventar una estética paralela.

## Motion foundation

RC58 define tokens de motion, no introduce animación decorativa extensa.

Debe existir desde ahora:

- durations;
- easing;
- reduced-motion policy;
- reglas para feedback;
- reglas para transitions de layout.

RC61 implementará motion de producto sobre esta base.

## Performance budget

El Design System debe reducir fragmentación, no aumentar peso sin control.

Gates:

- fuentes optimizadas;
- iconos tree-shaken;
- sin duplicar bibliotecas para resolver la misma primitive;
- no layout shift por fuentes/iconos;
- CSS y JS medidos por build;
- primitives lazy cuando sea razonable.

## Web comercial

La web comercial consume la misma identidad visual y tokens de marca, pero no queda obligada a reutilizar todos los componentes operativos de la app.

Debe compartir:

- color;
- tipografía;
- iconografía;
- radios;
- spacing;
- motion language;
- data visualization language.

La narrativa comercial conserva libertad de composición.

## Fuera de alcance RC58

- ECharts y dashboards de progreso completos;
- Health Connect histórico;
- drag and drop del constructor;
- motion avanzado;
- agenda;
- onboarding guiado;
- video player;
- quality automation completa;
- migración RC46 strict coach scope;
- despliegue de producción.

## Subfases

### RC58.1 — Token Foundation
Fuente canónica de tokens, CSS mappings, Android mapping mínimo, tipografía y paleta.

### RC58.2 — Icon + Typography System
Lucide, reglas de iconografía, Inter Variable, Source Serif 4 selectiva y asset provenance.

### RC58.3 — Core Primitives
Buttons, fields, cards, states, dialogs, tooltips/popovers, feedback y layout primitives.

### RC58.4 — Role Surfaces
Aplicación controlada a Cliente, Coach y Admin con densidad por rol.

### RC58.5 — Native + Commercial Alignment
Mapeo de identidad a shells nativas y tokens compartibles con la web comercial.

### RC58.6 — Visual/Accessibility Closeout
Regresión funcional, visual matrices, teclado, contraste, responsive y closeout.

NEXT_ACTION=RC58_1_TOKEN_FOUNDATION