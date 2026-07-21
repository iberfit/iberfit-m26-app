# IBERFIT M26 · RC17 Resilience Candidate

RC17 es la evolución acumulativa de RC16 y la candidata local más resistente hasta este checkpoint. Endurece aislamiento por cliente, autenticación, transporte, idempotencia, recuperación offline, transiciones de sesión, formularios de engagement, sincronización, PWA y validación de catálogo remoto.

## Validación reproducible

- 167/167 pruebas automáticas.
- 285/285 comprobaciones en 18 familias de gates.
- 15/15 vistas Chromium selladas.
- 2/2 recorridos integrados Coach/Cliente.
- 49 módulos web resueltos, sin módulos ausentes.
- 83 activos en el build web y presupuestos aprobados.
- 122 archivos protegidos M25/M25.2 sin cambios.
- 367 ejercicios canónicos preservados.

El comando `npm run gate` usa un orquestador determinista que vuelve a ejecutar pruebas, build, grafo de módulos, registro de comandos y las 18 familias de gates; además verifica los informes sellados de QA visual e integrada. La reproducción completa de navegador se ejecuta con `npm run qa:visual:rc17` y `npm run qa:integrated:rc17`.

## Estado

**No desplegado y no desplegable todavía.** Faltan la comparación autenticada de las 52 definiciones del backend real, QA con cuentas reales, dispositivos físicos y canario remoto con rollback ensayado. Producción y M25.1 permanecen intactos.
