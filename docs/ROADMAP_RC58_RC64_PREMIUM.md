# IBERFIT M26 â€” Roadmap Premium RC58â€“RC64

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
RC58=NEXT

## Critical rail A â€” Admin / RC46

La migraciÃ³n strict Coachâ†’Cliente de RC46 no se aplica hasta cerrar el read-model organizacional de Admin.

Admin debe conservar visiÃ³n global autorizada aunque Coach quede limitado a sus clientes.

Este rail avanza en paralelo y es gate de RC46, no gate visual de RC58.

## RC58 â€” IBERFIT Design System

Objetivo: unificar lenguaje visual, interaction patterns y primitives antes de aÃ±adir mÃ¡s librerÃ­as de producto.

Incluye tokens, Lucide, tipografÃ­a, component primitives, estados, accesibilidad, data-viz tokens, motion tokens y role density.

## RC59 â€” Session Intelligence & Data Platform

RC59 se amplÃ­a respecto a â€œData Experienceâ€: primero construye la espina dorsal longitudinal y luego la visualizaciÃ³n.

### RC59.0 â€” Canonical telemetry timeline
Unifica la sesiÃ³n real con la historia del cliente.

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

No se pierde el valor crudo vÃ¡lido por aplicar interpretaciones posteriores.

### RC59.1 â€” Live Session Intelligence
Convierte la FC live de RC57 en una capacidad visible y Ãºtil de producto.

Durante sesiÃ³n:
- FC actual;
- FC media/mÃ¡xima;
- calidad;
- fuente;
- timeline de FC;
- respuesta por bloque/ejercicio;
- recuperaciÃ³n durante descansos;
- correlaciÃ³n con RPE/RIR cuando exista.

Derivaciones como zonas, recuperaciÃ³n o carga cardiovascular deben conservar metodologÃ­a y no producir decisiones clÃ­nicas automÃ¡ticas.

### RC59.2 â€” Historical device acquisition
Health Connect Android histÃ³rico entra aquÃ­, no en RC58.
Lectura de pasos, sueÃ±o, FC reposo, VFC, energÃ­a y ejercicio con consentimiento y permisos por capacidad.

### RC59.3 â€” Longitudinal aggregation layer
7/28/90 dÃ­as, baseline, cambio, tendencia, adherencia y comparativas temporales sin decisiones clÃ­nicas automÃ¡ticas.

### RC59.4 â€” Data Experience / ECharts
Cliente: lectura sencilla.
Coach: lectura profesional/comparativa.
SVG por defecto en grÃ¡ficos ordinarios mÃ³viles; renderer y mÃ³dulos se eligen por caso.

### RC59.5 â€” Challenge Metrics Foundation
Los retos consumen mÃ©tricas canÃ³nicas, nunca sensores directamente.

Tipos iniciales:
- constancia;
- sesiones;
- pasos;
- actividad;
- hÃ¡bitos;
- progreso personal;
- objetivos individualizados por Coach.

Los rankings grupales no exponen datos sanitarios crudos.
Nunca se incentiva â€œFC mÃ¡s altaâ€ como objetivo competitivo.

### RC59.6 â€” Data trust UX
Siempre visible cuando importe: procedencia, fecha, calidad, cobertura, dato faltante y mÃ©todo.

Regla:
dato â†’ contexto â†’ entrenador decide.

## Cross-cutting rail E â€” Engagement & Challenges

El sistema de retos se apoya en el foundation de RC59.5 y en la capa `engagement` existente.

Debe contemplar:
- objetivos individuales;
- retos por adherencia;
- rachas;
- hitos;
- progreso porcentual;
- retos de grupo con privacidad;
- Coach challenges;
- anti-cheat bÃ¡sico por provenance/calidad;
- opt-in explÃ­cito cuando el reto use datos de dispositivos.

Los datos sanitarios crudos no se publican en leaderboards.

## RC60 â€” Coach Productivity

- Fuse.js para bÃºsqueda tolerante;
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

La virtualizaciÃ³n se aplica por necesidad medida, no como default de cada lista.

## RC61 â€” Motion & Microinteractions

Se prioriza un solo lenguaje de motion.

Motion (JavaScript) serÃ¡ el motor principal cuando CSS/WAAPI simple no alcance.

AutoAnimate no serÃ¡ dependencia transversal por defecto; solo se admitirÃ¡ si resuelve un caso concreto sin crear una segunda gramÃ¡tica de animaciÃ³n.

Casos:
- guardar serie;
- completar ejercicio;
- sincronizar;
- cambios de filtro;
- insertar/reordenar;
- feedback success/error;
- skeleton/empty transitions.

`prefers-reduced-motion` es obligatorio.

## RC62 â€” Agenda, Guidance & Onboarding

### Agenda
FullCalendar Standard para dÃ­a/semana y operaciÃ³n Coach inicialmente.

No se diseÃ±a una dependencia oculta de vistas resource premium. Si IBERFIT necesita timeline multi-coach/recursos, se evalÃºa valor/licencia antes de adoptar FullCalendar Premium.

### Guidance
Tooltip/Popover infrastructure viene de RC58.
RC62 aÃ±ade ayuda contextual de IRI, VFC, calidad, procedencia y carga.

### Onboarding
Progressive onboarding por rol y por funciÃ³n.
Driver.js puede usarse para tours cortos, nunca como sustituto de una interfaz autoexplicativa.

## RC63 â€” Exercise & Media Experience

El player no es el producto completo.

Incluye:
- video tÃ©cnico;
- subtÃ­tulos WebVTT;
- velocidad;
- PiP cuando estÃ© soportado;
- poster;
- lazy loading;
- preload controlado;
- fallback escrito;
- provenance/licencia de assets;
- estado de media por ejercicio;
- comportamiento offline/de red deficiente;
- analÃ­tica tÃ©cnica de carga/error sin invadir privacidad.

Plyr se adopta si demuestra mejor UX que HTML media nativo en nuestros casos.

Lottie solo para usos concretos y con licencia verificada.

## RC64 â€” Quality Platform

RC64 no â€œempiezaâ€ la calidad; industrializa gates que cada RC ya debe respetar.

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

## Cross-cutting rail B â€” Trust & Data Governance

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

No se recopila un dato solo porque tÃ©cnicamente sea posible.

Se recopila si mejora una decisiÃ³n de servicio concreta y puede explicarse al cliente.

## Cross-cutting rail C â€” Commercial Web

Avanza en paralelo desde RC58.

- tokens de marca;
- hero con producto real;
- IRI visual;
- capturas/pantallas reales;
- narrativa del mÃ©todo;
- progreso realista;
- motion selectivo;
- Embla si aporta;
- fuentes autohospedadas;
- CSP;
- fingerprinting de assets;
- Lighthouse/axe/Playwright.

La web vende mostrando el producto, no aÃ±adiendo texto.

## Cross-cutting rail D â€” App distribution

DespuÃ©s de estabilizar RC58â€“RC64 se planifica distribuciÃ³n controlada Android/Wear, firma/release, polÃ­ticas de health data y rollout.

No se mezcla publicaciÃ³n de stores con la construcciÃ³n del Design System.

## Cross-cutting rail F â€” Security & Reliability

Seguridad y fiabilidad avanzan en paralelo desde RC58.

Principios:
- least privilege;
- tenant isolation;
- RLS como frontera de autorizaciÃ³n;
- secrets fuera de frontend;
- CSP strict-by-default;
- native bridge hardening;
- device telemetry como input no confiable;
- supply-chain review;
- idempotencia/retries/rollback;
- observabilidad sin filtrar health data;
- pruebas negativas de cross-client en cada cambio sensible.

El contrato detallado vive en `docs/SECURITY_RELIABILITY_RAIL_RC58_RC64.md`.

No prometemos una app â€œimposible de hackearâ€; diseÃ±amos prevenciÃ³n, detecciÃ³n, contenciÃ³n y recuperaciÃ³n.

## North Star

IBERFIT debe convertir datos dispersos en una relaciÃ³n de servicio superior:

capturar â†’ validar â†’ contextualizar â†’ mostrar â†’ revisar â†’ decidir â†’ acompaÃ±ar â†’ medir.

El cliente debe sentir simplicidad.

El Coach debe disponer de profundidad.

Admin debe tener control organizacional.

La complejidad tÃ©cnica debe quedar detrÃ¡s de la experiencia.