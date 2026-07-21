# IBERFIT M26 · Auditoría profunda RC16

## Resultado

RC16 endurece la candidata RC15 sin modificar las capas protegidas M25/M25.2 ni producción. La revisión cubre autenticación, transporte, Command Bus, permisos, recuperación offline, temporizadores, constructor, ejecución guiada, engagement, progreso, IA, PWA, seguridad web, accesibilidad, responsive, integridad y reproducibilidad.

## Correcciones principales

- Single-flight y exclusión mutua en operaciones y sincronización.
- Validación estricta de IDs, payloads, revisiones, tamaños y fechas.
- Sesión autenticada con refresh single-flight e identidad inmutable.
- Recuperación offline aislada por usuario/cliente/sesión, con TTL y eliminación de snapshots corruptos.
- Temporizadores resistentes a fechas inválidas y reapertura de la aplicación.
- Selección estricta de sesiones publicadas y citas confirmadas vinculadas.
- Constructor plenamente editable con prescripción objetiva, grupos, reordenamiento, revisión previa y publicación tras aceptación.
- Ejecución con ACK remoto antes de transiciones críticas, límites de RPE/RIR y detalle obligatorio ante dolor.
- Progreso capaz de leer resultados por clave, cargas con unidad y fechas canónicas.
- Engagement aislado por cliente; notas privadas exclusivamente Coach/Administrador y nunca offline.
- Catálogo same-origin, 367 ejercicios mínimos y fallback seguro para contextos `about:blank` de QA.
- Corrección real del layout del constructor: cada editor ocupa una sola columna y no desborda el viewport.
- Auditoría Chromium de 15 vistas y QA integrado de Coach/Cliente con transporte simulado y cero llamadas a producción.

## Riesgos que permanecen externos

La candidata no se declara desplegable hasta completar lectura autenticada del registro remoto, pruebas con cuentas QA reales, revisión en dispositivos físicos y canario con rollback ensayado. Ninguna de estas validaciones se sustituye por mocks locales.
