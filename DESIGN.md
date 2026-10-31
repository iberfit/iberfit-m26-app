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

La referencia aprobada Cliente Hoy Dark Signature V2.3 de Stitch es el nivel mínimo de calidad para Cliente, Coach y Admin: composición, tipografía, profundidad, gráficos y adaptación por tarea/dispositivo. Los originales permanecen exclusivamente en `iberfit/Iberfit-platform` privado. Reutilizar comandos, permisos, calendario, datos y persistencia reales; nunca trasladar identidades o métricas DEMO. La adaptación inicial de Cliente en PR #1213 no certifica todavía paridad visual ni los otros roles.

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


## SIGNATURE U50 · Dirección visual aprobada (29-10-2026)

- El isotipo **oficial** IBERFIT es el único arte ambiental en las superficies autenticadas: baja opacidad, sin recolor, sin montañas, paisajes, bosques ni retratos decorativos.
- Fotos de usuarios: mostrar exclusivamente las imágenes subidas con el controlador privado M42; inicial cuando no haya imagen autorizada. No inventar perfiles ni reemplazar avatares.
- Canvas verde profundo y superficies crema/warm gray selectivas, texto de alto contraste, dorado reservado a jerarquía y marca. Estética editorial deportiva, no SaaS ni landing fotográfica.
- Cliente: Entreno, Evolución y Bienestar como accesos a rutas reales, sin simular sesión lista ni métricas. Preservar IRI de inicio separado del seguimiento longitudinal.
- Coach: prioridad real de sesión/ejecución, decisión rápida y datos de carga; Admin: operación, trazabilidad, tablas legibles. Cada rol conserva densidad propia.
- Microinteracciones discretas, 44px+ touch, foco visible, soporte reduced motion y forced colors. No introducir imágenes externas ni efectos que eleven el coste de render.

## SIGNATURE U51 · Composición real de producto (29-10-2026)

- El estándar de referencia visual se valida **sobre el mismo DOM, estado y datos de IBERFIT**. Las imágenes conceptuales no son evidencia de implementación.
- Cliente Hoy: la acción principal y las rutas Entreno / Evolución / Bienestar forman una sola composición compacta. Las métricas o sesiones se muestran sólo con registros confirmados. El método sigue disponible mediante un disclosure accesible; la prioridad visual es la acción real.
- Coach: preservar la guía funcional de puesta en marcha, reducir ruido y destacar cliente, próxima decisión, agenda y carga. Admin: compactar directorio sin esconder controles de permisos y mostrar únicamente barras de capacidad respaldadas por carga registrada.
- Se reutilizan el isotipo oficial y el controlador de avatares privados M42. No se añaden assets ficticios, imágenes ambientales de personas ni paisajes.
- 320px/móvil/tablet/escritorio, foco, touch, safe areas, accesibilidad, WebAuthn, PWA y tests de sesiones determinan la certificación.

## U55 · Piloto Depth Athletic, sistema de producto (30-10-2026)

- Profundidad no equivale a añadir sombras indiscriminadamente: se consigue mediante jerarquía de plano, contraste editorial y una sola dirección de luz suave, reservada a superficies principales; bordes y sombras están subordinados a la legibilidad.
- Cliente: mayor espacio para próxima acción y datos auténticos, minimizando bienestar duplicado y tarjetas de explicación.
- Coach: área de prioridad con decisiones visibles y resumen de cartera en franja estrecha, sin retirar el recorrido de activación ni acciones de sesión.
- Admin: estadísticas verificadas y directorio centrado en jerarquía de identidades/roles, sin sacrificar los campos de auditoría.
- Móvil 320–390px, tablet y escritorio; SVG vectorial y captura dPR 2/3 cuando haya evidencia; foco contrastado, forced-colors y reduced-motion.
- La referencia visual aprobada es una exigencia de calidad de producto, no garantía de que el piloto esté terminado; no extender a todas las rutas sin aprobación real del usuario.

## U56 · Acabado editorial de alta densidad, sin falsificar datos

- Cliente/Coach/Admin comparten materiales de marca, **no el mismo layout**: primer impacto emocional y próxima acción real en Cliente; decisión y agenda inmediata en Coach; densidad y trazabilidad en Admin.
- Acabado nítido mediante vector SVG, números tabulares, tipografía editorial controlada y capas mate; una sola iluminación suave por portada. No utilizar ilustraciones humanas, imágenes externas ni métricas de muestra.
- Entrada breve solo para títulos principales y solo si no está activado movimiento reducido; sin loops, parallax, componentes que dependan de animación, ni bloqueos de controles.
- El gráfico fuerza enseña exclusivamente serie confirmada y comparable, retícula 0–100%, marcador final real y unidades kg·rep. La maqueta conceptual **no** es un origen de datos ni una captura autenticada.
- Mantener el piloto como WIP del PR #1200. Exigir evidencia 320/390 px dPR2/3, tablet, escritorio, y QA real antes de merge / Canary / PROD.

## Regla permanente · PRODUCT-FIRST · Stitch como director de producto y diseño (31-10-2026)

**Decisión expresa de producto aprobada:** no continuaremos añadiendo cosmética sobre pantallas antiguas como estrategia de transformación visual. El proceso obligatorio es **Stitch define experiencia y sistema visual premium → IBERFIT integra datos, reglas y acciones reales → QA homologa fidelidad y funcionalidad → Canary → producción certificada**.

- Diseño **antes** de implementación: arquitectura de información, decisiones, journeys Cliente/Coach/Admin, pantallas completas y estados, navegación, microinteracciones, responsive, materiales tipográficos/gráficos y sistema de componentes. No 43 ilustraciones sueltas.
- Stitch usa el proyecto existente `1399435845853535416`. La única referencia formalmente aprobada hoy es Cliente Hoy V2.3 390px. La extensión a otros flujos/roles requiere evidencia de nuevas pantallas y aprobación, no inferencia.
- Contrato privado y fuentes: `iberfit/Iberfit-platform/design-stitch/IBERFIT_STITCH_PRODUCT_FIRST_MASTER_2026-10-31.md`. No copiar las exportaciones privadas ni demos al repositorio público.
- La fuente de verdad de permisos, sesiones, clientes, datos, RLS, Auth, ACK, errores/reintentos y persistencia **siempre** es la aplicación real, no un prototipo de Stitch. Si propone nuevas funciones, se revisa su impacto antes de incorporarlas.
- Handoff por ruta/estado: referencia aprobada, datos autorizados, acción canónica, componente, estados, responsive, accesibilidad, error, recuperación y prueba. Transformación visual a nivel de arquitectura, no cascadas de CSS.
- Prioridad de diseño: **viaje Cliente completo → flujo operativo Coach completo → control y auditoría Admin**; extender sistemáticamente a las 43 rutas con densidad distinta por rol.
- No declarar paridad por CI ni capturas sintéticas; contrastar capturas autenticadas y tareas reales en móvil/tablet/desktop. Mantener la PR SIGNATURE visual en Draft hasta completar la fase de diseño y los gates, no publicar una versión inferior al original Stitch.
- Las referencias Stitch **no sustituyen** exigencias del contrato de seguridad, estabilidad, integridad, accesibilidad WCAG 2.2 AA ni rendimiento. Implementar sólo con rollouts reversibles y conservar la funcionalidad.

