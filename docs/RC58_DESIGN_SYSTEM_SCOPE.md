# IBERFIT M26 â€” RC58 Design System

## Estado

RC58_SCOPE_STATUS=APPROVED
RC58_SCOPE_NAME=IBERFIT_DESIGN_SYSTEM
RC58_BASE_COMMIT=1d9074bae9f753d2f0cb8371468dba335506fbbc

RC58 inicia la fase de producto premium posterior al cierre de RC57.

Objetivo: construir un lenguaje visual y de interacciÃ³n Ãºnico para Cliente, Coach, Admin, shells Android y web comercial, sin acoplar el diseÃ±o a una librerÃ­a concreta ni duplicar decisiones visuales entre superficies.

## Principio de producto

IBERFIT no debe parecer una colecciÃ³n de mÃ³dulos funcionales. Debe sentirse como un Ãºnico producto premium.

El lujo IBERFIT se define por:

- jerarquÃ­a clara;
- densidad correcta segÃºn rol;
- consistencia;
- velocidad percibida;
- feedback inmediato;
- ausencia de ruido visual;
- datos comprensibles;
- accesibilidad;
- detalle tipogrÃ¡fico;
- estados completos;
- cero interfaces falsas o decorativas que no funcionen.

## Arquitectura de tokens

RC58 tendrÃ¡ una fuente canÃ³nica de tokens semÃ¡nticos, independiente de plataforma.

Debe cubrir:

- color de marca;
- superficies;
- texto;
- bordes;
- estados;
- foco;
- espaciado;
- radios;
- elevaciÃ³n;
- tipografÃ­a;
- tamaÃ±os;
- breakpoints;
- densidad;
- z-index;
- motion duration/easing;
- data visualization palette;
- tamaÃ±os tÃ¡ctiles.

Los consumidores derivados podrÃ¡n ser CSS custom properties y mappings nativos Android. No se duplicarÃ¡n manualmente valores de marca en varias superficies.

## TipografÃ­a

- Inter Variable: interfaz, navegaciÃ³n, formularios, tablas, mÃ©tricas y controles.
- Source Serif 4: uso editorial selectivo, informes IRI, narrativa y piezas donde aporte jerarquÃ­a premium.
- No usar Source Serif 4 en controles densos o texto operativo.
- Fuentes autohospedadas.
- Licencia y provenance de cada asset deben quedar documentadas.
- Carga optimizada para evitar layout shift.

## IconografÃ­a

Lucide serÃ¡ el sistema base de iconos.

Reglas:

- importaciÃ³n selectiva;
- tamaÃ±o y stroke definidos por tokens;
- iconos no sustituyen etiquetas cuando el significado pueda ser ambiguo;
- botones icon-only requieren nombre accesible;
- no mezclar familias visuales sin una excepciÃ³n documentada.

## Component primitives

RC58 no termina en tokens. Debe crear primitives reutilizables.

MÃ­nimo:

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

Floating-position infrastructure puede incorporarse en RC58 para Tooltip/Popover; RC62 la explotarÃ¡ para ayuda contextual.

## Roles y densidad

Los mismos primitives deben producir experiencias distintas sin convertirse en tres productos diferentes.

Cliente:
- lectura calmada;
- prioridad mÃ³vil;
- menos densidad;
- foco en siguiente acciÃ³n y progreso.

Coach:
- densidad media-alta;
- comparaciones;
- filtros;
- operaciÃ³n rÃ¡pida;
- teclado cuando aporte velocidad.

Admin:
- densidad alta;
- visiÃ³n organizacional;
- tablas/listas amplias;
- estados y permisos explÃ­citos.

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

RC64 automatizarÃ¡ estos gates, pero RC58 debe construir accesibilidad y estados correctamente desde origen. No se aplaza accesibilidad hasta RC64.

## Accesibilidad

RC58 adopta WCAG 2.2 AA como baseline de diseÃ±o.

AdemÃ¡s:

- target tÃ¡ctil IBERFIT recomendado de 44x44 CSS px para acciones principales;
- focus visible consistente;
- navegaciÃ³n por teclado;
- contraste semÃ¡ntico;
- no depender solo del color;
- orden de foco coherente;
- reduced motion preparado desde tokens;
- errores asociados a sus campos;
- nombres accesibles para icon buttons.

## Data visualization foundation

RC58 NO implementa ECharts todavÃ­a.

SÃ­ define antes:

- paleta accesible de series;
- colores de positivo/negativo/neutro sin significado clÃ­nico automÃ¡tico;
- tipografÃ­a de ejes;
- formato de unidades;
- comportamiento de `Sin dato`;
- badges de calidad/procedencia;
- tooltips visuales;
- layout de cards de mÃ©tricas.

AsÃ­ RC59 puede introducir grÃ¡ficos sin inventar una estÃ©tica paralela.

## Motion foundation

RC58 define tokens de motion, no introduce animaciÃ³n decorativa extensa.

Debe existir desde ahora:

- durations;
- easing;
- reduced-motion policy;
- reglas para feedback;
- reglas para transitions de layout.

RC61 implementarÃ¡ motion de producto sobre esta base.

## Performance budget

El Design System debe reducir fragmentaciÃ³n, no aumentar peso sin control.

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
- tipografÃ­a;
- iconografÃ­a;
- radios;
- spacing;
- motion language;
- data visualization language.

La narrativa comercial conserva libertad de composiciÃ³n.

## Fuera de alcance RC58

- ECharts y dashboards de progreso completos;
- Health Connect histÃ³rico;
- drag and drop del constructor;
- motion avanzado;
- agenda;
- onboarding guiado;
- video player;
- quality automation completa;
- migraciÃ³n RC46 strict coach scope;
- despliegue de producciÃ³n.

## Subfases

### RC58.1 â€” Token Foundation
Fuente canÃ³nica de tokens, CSS mappings, Android mapping mÃ­nimo, tipografÃ­a y paleta.

### RC58.2 â€” Icon + Typography System
Lucide, reglas de iconografÃ­a, Inter Variable, Source Serif 4 selectiva y asset provenance.

### RC58.3 â€” Core Primitives
Buttons, fields, cards, states, dialogs, tooltips/popovers, feedback y layout primitives.

### RC58.4 â€” Role Surfaces
AplicaciÃ³n controlada a Cliente, Coach y Admin con densidad por rol.

### RC58.5 â€” Native + Commercial Alignment
Mapeo de identidad a shells nativas y tokens compartibles con la web comercial.

### RC58.6 â€” Visual/Accessibility Closeout
RegresiÃ³n funcional, visual matrices, teclado, contraste, responsive y closeout.

NEXT_ACTION=RC58_1_TOKEN_FOUNDATION