# IBERFIT M26 — Roadmap Premium RC58–RC64

## Estado actual

RC46=FUNCTIONAL_ADMIN_GATE_PENDING
RC47=BUILT
RC48=BUILT
RC49=BUILT
RC50=BUILT
RC51=BUILT
RC52=BUILT
RC53=BUILT
RC54=BUILT
RC55=BUILT
RC56=PHYSICAL_E2E_CLOSED
RC57=SOFTWARE_CLOSED
RC57_BLE_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE
RC58=CLOSED_RC58_6_VISUAL_ACCESSIBILITY
RC59_0C2C=CANONICAL_APPLIED
RC59_0C2D=CLOSED_MIGRATION_HISTORY_ALIGNED
RC59_0C3=CLOSED_AUTHENTICATED_RUNTIME_SMOKE
RC59_0=CLOSED_RC59_0C3_REMOTE_OUTBOX_UPLOAD
RC59_1=CLOSED_LIVE_SESSION_INTELLIGENCE
RC59_2=SOFTWARE_CLOSED_HISTORICAL_DEVICE_ACQUISITION
RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE
RC59_3=CLOSED_LONGITUDINAL_AGGREGATION_LAYER
RC59_4=CLOSED_DATA_EXPERIENCE_ECHARTS
RC59_5=CLOSED_CHALLENGE_METRICS_FOUNDATION
RC59_6=CLOSED_DATA_TRUST_UX
RC60=IN_PROGRESS_COACH_PRODUCTIVITY
PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL

## Critical rail A — Admin / RC46

La migración strict Coach→Cliente de RC46 no se aplica hasta cerrar el read-model organizacional de Admin.

Admin debe conservar visión global autorizada aunque Coach quede limitado a sus clientes.

Este rail avanza en paralelo y es gate de RC46, no gate visual de RC58.

## RC58 — IBERFIT Design System

Objetivo: unificar lenguaje visual, interaction patterns y primitives antes de añadir más librerías de producto.

Incluye tokens, Lucide, tipografía, component primitives, estados, accesibilidad, data-viz tokens, motion tokens y role density.

## RC59 — Session Intelligence & Data Platform

RC59 se amplía respecto a “Data Experience”: primero construye la espina dorsal longitudinal y luego la visualización.

### RC59.0 — Canonical telemetry timeline
Unifica la sesión real con la historia del cliente.

Entrega incremental:
- **RC59.0A:** contrato canónico puro e inmutable;
- **RC59.0B:** ingestión live y timeline local acotado;
- **RC59.0C:** persistencia/outbox, retención e idempotencia sin inflar snapshots operativos.

Cada muestra/evento debe poder correlacionarse con:
- `clientId`;
- `sessionId`;
- `executionId`;
- timestamp;
- fase/bloque/ejercicio/serie cuando exista;
- provider;
- device type;
- quality;
- provenance.

No se pierde el valor crudo válido por aplicar interpretaciones posteriores.

### RC59.1 — Live Session Intelligence
Convierte la FC live de RC57 en una capacidad visible y útil de producto.

Durante sesión:
- FC actual;
- FC media/máxima;
- calidad;
- fuente;
- timeline de FC;
- respuesta por bloque/ejercicio;
- recuperación durante descansos;
- correlación con RPE/RIR cuando exista.

Derivaciones como zonas, recuperación o carga cardiovascular deben conservar metodología y no producir decisiones clínicas automáticas.

### RC59.2 — Historical device acquisition
Health Connect Android histórico entra aquí, no en RC58.
Lectura de pasos, sueño, FC reposo, VFC, energía y ejercicio con consentimiento y permisos por capacidad.

### RC59.3 — Longitudinal aggregation layer
7/28/90 días, baseline, cambio, tendencia, adherencia y comparativas temporales sin decisiones clínicas automáticas.

### RC59.4 — Data Experience / ECharts
Cliente: lectura sencilla.
Coach: lectura profesional/comparativa.
SVG por defecto en gráficos ordinarios móviles; renderer y módulos se eligen por caso.

### RC59.5 — Challenge Metrics Foundation
Los retos consumen métricas canónicas, nunca sensores directamente.

Tipos iniciales:
- constancia;
- sesiones;
- pasos;
- actividad;
- hábitos;
- progreso personal;
- objetivos individualizados por Coach.

Los rankings grupales no exponen datos sanitarios crudos.
Nunca se incentiva “FC más alta” como objetivo competitivo.

### RC59.6 — Data trust UX
Siempre visible cuando importe: procedencia, fecha, calidad, cobertura, dato faltante y método.

Regla:
dato → contexto → entrenador decide.

## Cross-cutting rail E — Engagement & Challenges

El sistema de retos se apoya en el foundation de RC59.5 y en la capa `engagement` existente.

Debe contemplar:
- objetivos individuales;
- retos por adherencia;
- rachas;
- hitos;
- progreso porcentual;
- retos de grupo con privacidad;
- Coach challenges;
- anti-cheat básico por provenance/calidad;
- opt-in explícito cuando el reto use datos de dispositivos.

Los datos sanitarios crudos no se publican en leaderboards.

## Cross-cutting rail F — Premium Report Parity

Todo informe formal entregado por IBERFIT a Cliente, Coach o Admin debe alcanzar
como mínimo el nivel editorial, metodológico y de presentación del Informe IRI
Premium, adaptado a su objetivo y audiencia.

No se considera informe premium una captura de dashboard, un volcado de tablas
o una impresión genérica del navegador.

Familia mínima objetivo:
- IRI inicial;
- reevaluación IRI comparativa;
- progreso periódico;
- cierre de ciclo;
- longitudinal 7/28/90 días;
- adherencia y hábitos;
- actividad/dispositivos;
- informe técnico Coach/Admin;
- versión Cliente simplificada cuando corresponda.

Gate común:
- identidad IBERFIT;
- trazabilidad y periodo;
- procedencia/calidad/cobertura;
- resultados y comparaciones;
- interpretación contextual;
- conclusiones y próximos pasos cuando proceda;
- metodología/comparabilidad cuando aplique;
- revisión profesional;
- fecha/versión;
- salida A4/PDF premium y representación accesible.

El Informe IRI existente es la referencia mínima de calidad, no una excepción.
El contrato completo se mantiene en `docs/product/PREMIUM_REPORT_PARITY.md`.

## RC60 — Coach Productivity

- Fuse.js para búsqueda tolerante;
- TanStack Virtual Core para listas realmente grandes;
- SortableJS solo donde aporte;
- keyboard reorder y controles convencionales siempre disponibles;
- command palette;
- quick actions;
- filtros guardados;
- recientes;
- duplicar/reutilizar sesiones;
- templates/versiones;
- operaciones masivas seguras.

La virtualización se aplica por necesidad medida, no como default de cada lista.

## RC61 — Motion & Microinteractions

Se prioriza un solo lenguaje de motion.

Motion (JavaScript) será el motor principal cuando CSS/WAAPI simple no alcance.

AutoAnimate no será dependencia transversal por defecto; solo se admitirá si resuelve un caso concreto sin crear una segunda gramática de animación.

Casos:
- guardar serie;
- completar ejercicio;
- sincronizar;
- cambios de filtro;
- insertar/reordenar;
- feedback success/error;
- skeleton/empty transitions.

`prefers-reduced-motion` es obligatorio.

## RC62 — Agenda, Guidance & Onboarding

### Agenda
FullCalendar Standard para día/semana y operación Coach inicialmente.

No se diseña una dependencia oculta de vistas resource premium. Si IBERFIT necesita timeline multi-coach/recursos, se evalúa valor/licencia antes de adoptar FullCalendar Premium.

### Guidance
Tooltip/Popover infrastructure viene de RC58.
RC62 añade ayuda contextual de IRI, VFC, calidad, procedencia y carga.

### Onboarding
Progressive onboarding por rol y por función.
Driver.js puede usarse para tours cortos, nunca como sustituto de una interfaz autoexplicativa.

## RC63 — Exercise & Media Experience

El player no es el producto completo.

Incluye:
- video técnico;
- subtítulos WebVTT;
- velocidad;
- PiP cuando esté soportado;
- poster;
- lazy loading;
- preload controlado;
- fallback escrito;
- provenance/licencia de assets;
- estado de media por ejercicio;
- comportamiento offline/de red deficiente;
- analítica técnica de carga/error sin invadir privacidad.

Plyr se adopta si demuestra mejor UX que HTML media nativo en nuestros casos.

Lottie solo para usos concretos y con licencia verificada.

## RC64 — Quality Platform

RC64 no “empieza” la calidad; industrializa gates que cada RC ya debe respetar.

Incluye:
- Playwright;
- axe-core;
- Lighthouse CI;
- visual regression;
- console/network error gates;
- desktop/tablet/mobile;
- Cliente/Coach/Admin;
- normal/loading/empty/error/retry/conflict/offline;
- keyboard;
- touch targets;
- overflow;
- performance budgets;
- Core Web Vitals;
- deterministic fixtures;
- production-like smoke tests;
- runtime observability contract.

No sustituye los tests RC existentes; los integra.

## Cross-cutting rail B — Trust & Data Governance

A partir de RC59 cualquier nueva fuente de datos debe registrar:

- consentimiento;
- finalidad;
- procedencia;
- timestamps;
- calidad;
- ownership;
- permisos;
- retention policy;
- export/delete path;
- auditability.

No se recopila un dato solo porque técnicamente sea posible.

Se recopila si mejora una decisión de servicio concreta y puede explicarse al cliente.

## Cross-cutting rail C — Commercial Web · diferido

COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

La app es el único foco activo hasta cerrar su roadmap y sus gates de lanzamiento.

El backlog comercial se conserva íntegro para después:

- tokens de marca;
- hero con producto real;
- IRI visual;
- capturas/pantallas reales;
- narrativa del método;
- progreso realista;
- motion selectivo;
- Embla si aporta;
- fuentes autohospedadas;
- CSP;
- fingerprinting de assets;
- Lighthouse/axe/Playwright.

La web venderá mostrando el producto terminado, no desviando capacidad durante su construcción.

## Cross-cutting rail D — App distribution

Después de estabilizar RC58–RC64 se planifica distribución controlada Android/Wear, firma/release, políticas de health data y rollout.

No se mezcla publicación de stores con la construcción del Design System.

## Cross-cutting rail F — Security & Reliability

Seguridad y fiabilidad avanzan en paralelo desde RC58.

Principios:
- least privilege;
- tenant isolation;
- RLS como frontera de autorización;
- secrets fuera de frontend;
- CSP strict-by-default;
- native bridge hardening;
- device telemetry como input no confiable;
- supply-chain review;
- idempotencia/retries/rollback;
- observabilidad sin filtrar health data;
- pruebas negativas de cross-client en cada cambio sensible.

El contrato detallado vive en `docs/SECURITY_RELIABILITY_RAIL_RC58_RC64.md`.

No prometemos una app “imposible de hackear”; diseñamos prevención, detección, contención y recuperación.

## North Star

IBERFIT debe convertir datos dispersos en una relación de servicio superior:

capturar → validar → contextualizar → mostrar → revisar → decidir → acompañar → medir.

El cliente debe sentir simplicidad.

El Coach debe disponer de profundidad.

Admin debe tener control organizacional.

La complejidad técnica debe quedar detrás de la experiencia.