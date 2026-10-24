# IBERFIT · Design Contract

Estado: canónico para decisiones visuales y de interacción. Los documentos RC58 aportan detalle de implementación y evidencia histórica; este archivo define el criterio permanente.

## Identidad

IBERFIT debe sentirse premium, profesional, humano, sobrio, elegante, deportivo y tecnológico.

Paleta de marca:
- verde oscuro / verde-negro profundo como base;
- dorado para marca, selección y señales de valor;
- crema / marfil cálido para texto y contraste;
- colores funcionales independientes para éxito, atención, riesgo e información.

Evitar:
- neón;
- negro puro como canvas principal;
- gradientes gratuitos;
- estética SaaS genérica;
- estética visual de “IA”;
- exceso de tarjetas;
- decoración sin función;
- saturación de isotipo;
- mezclar familias iconográficas;
- texto crema/dorado con contraste insuficiente.

Usar siempre el logo/isotipo real de IBERFIT. No inventar variantes de marca.

## SIGNATURE 360 · Calidez visual, redondez y excelencia

- Las grandes superficies de Cliente, Coach y Admin deben usar bosque oscuro cálido, oliva y capas profundas; **no** blanco puro o gris azulado de aspecto clínico. Marfil y arena son colores de lectura, no fondos dominantes.
- Reservar el dorado/champán para marca, acción o decisión importante; los estados de error, éxito o conflicto se comunican semánticamente y con texto. Nunca convertir todo en dorado.
- Priorizar curvas coherentes y tacto premium: en Cliente, radios generosos y composiciones fluidas; en Coach, curvas que no consuman el espacio de una sesión; en Admin, jerarquía operativa y densidad controlada. No aplicar el mismo componente a todos los roles.
- Reducir tarjetas anidadas y bordes repetidos. Una banda de datos relacionados es preferible a cinco cajas inconexas, siempre que lectura, navegación, contraste y foco permanezcan claros.
- Mostrar primero la siguiente acción **real**, luego el contexto. En estados vacíos comunicar voluntariedad y recuperación, sin culpa, métricas inventadas, automatismos falsos o presión comercial.
- Verificar cada cambio en capturas QA autenticadas del SHA exacto, escritorio/tablet/320/390 px, y con pruebas de tareas, foco, touch, safe areas, zoom, texto extenso, reduced motion y roles. Las composiciones imaginadas no certifican la aplicación.
- Mantener el CSS integrado en la hoja canónica de cada componente. Los tokens generados no se editan manualmente, se cambia la fuente de generación si corresponde. No añadir cascadas de overrides o efectos visuales gratuitos.

## Fuente de verdad visual

- tokens semánticos: fuente canónica existente del sistema de diseño;
- CSS generado/derivado, no valores de marca duplicados manualmente;
- `docs/RC58_DESIGN_SYSTEM_SCOPE.md` y subfases RC58 documentan la implementación;
- `docs/DARK_IBERFIT_V2.md` documenta la capa dark autenticada actual.

Si existe conflicto, prevalece el estado real del código y los tokens canónicos, y se actualiza este contrato si la decisión duradera cambia.

## Jerarquía

Cada pantalla debe tener:
1. una intención principal clara;
2. una siguiente acción inequívoca;
3. información secundaria subordinada;
4. estados y feedback visibles;
5. densidad adecuada al rol.

No añadir paneles, badges, métricas o acciones sin propósito claro.

## Roles

### Cliente

- calmado;
- móvil primero;
- lectura rápida;
- menos densidad;
- foco en siguiente acción, progreso y motivación;
- lenguaje comprensible.

### Coach

- operativo;
- densidad media-alta;
- velocidad de sesión;
- comparaciones y contexto visibles;
- touch y teclado eficientes;
- edición rápida sin perder precisión.

### Admin

- densidad alta;
- control y trazabilidad;
- tablas/listas amplias cuando aporten valor;
- estados, permisos y consecuencias explícitos.

No diseñar los tres roles como la misma interfaz con permisos diferentes.

## Tipografía e iconos

- Inter Variable para interfaz operativa;
- Source Serif 4 sólo en usos editoriales selectivos donde aporte jerarquía premium;
- Lucide como familia base de iconos;
- importación selectiva;
- icon-only siempre con nombre accesible;
- no usar iconos ambiguos sin etiqueta o contexto.

## Componentes y estados

Los primitives reutilizables deben preservar comportamiento consistente.

Cuando aplique, contemplar:
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

No construir controles visualmente interactivos que no funcionen.

## Formularios

Contrato crítico histórico:
- inputs y selects no pueden perder foco al soltar click/touch;
- dropdowns no pueden cerrarse por un ciclo pointer/mouse incorrecto;
- teclado debe funcionar de forma predecible;
- labels y errores deben asociarse semánticamente;
- modales, sheets y overlays no pueden secuestrar focus o bloquear la pantalla de forma invisible.

Todo cambio de formularios debe proteger este comportamiento con tests proporcionales.

## Responsive y dispositivos

- desktop = analizar y construir;
- tablet = entrenar y operar;
- móvil = actuar y completar.

Revisar siempre:
- touch targets;
- teclado;
- scroll;
- safe areas;
- overlays;
- modales;
- selects;
- tablas/listas;
- navegación inferior;
- orientación y altura reducida;
- PWA/standalone cuando corresponda.

## Accesibilidad

Baseline: WCAG 2.2 AA.

Además:
- focus visible;
- orden de foco coherente;
- contraste semántico;
- no depender sólo del color;
- target táctil recomendado de 44x44 CSS px para acciones principales;
- reduced motion;
- errores vinculados a sus campos;
- nombres accesibles en controles icon-only.

## Motion

Movimiento sólo cuando mejora comprensión, continuidad o feedback.

Evitar animación ornamental. Respetar `prefers-reduced-motion` y tokens de duración/easing.

## Datos y gráficas

Las gráficas deben:
- responder una pregunta concreta;
- indicar periodo, unidad y procedencia;
- permitir comparación;
- manejar `Sin dato` de forma explícita;
- mantener paleta accesible;
- evitar “dashboard por decoración”.

## Performance visual

El diseño no puede degradar rendimiento.

Evitar:
- fuentes duplicadas;
- icon packs completos;
- JS para efectos puramente visuales;
- layout shift;
- imágenes sobredimensionadas;
- componentes pesados sin beneficio proporcional.

## Definition of Done visual

Una pantalla no está terminada hasta validar:
- jerarquía;
- estados;
- responsive;
- mouse/touch/teclado;
- accesibilidad;
- ausencia de regresiones funcionales;
- coherencia con Cliente/Coach/Admin;
- funcionamiento real en el entorno objetivo.

Ver `docs/DEFINITION_OF_DONE.md`.

## SIGNATURE B2 · Cliente, viaje de principio a fin
Al refinar Hoy, Sesiones, ejecución y evolución, los nuevos recursos deben estar
apoyados en datos existentes (no scores sintéticos), una acción primaria por región,
progresión por estado verdadero y comunicación de recuperación cuando el inicio no
está habilitado. Separar el tono inmersivo de ejercicio, el editorial de bienvenida,
la banda de estado de sesiones y la lectura longitudinal del seguimiento.
No aplicar un fondo universal nuevo al resto de los roles; no crear hojas CSS
premium-v4, ni añadir `!important` como estrategia de convergencia.
Los estados `ready/published/paused` de sesiones son de presentación y nunca
autorizan por sí mismos `start-published-session`.

