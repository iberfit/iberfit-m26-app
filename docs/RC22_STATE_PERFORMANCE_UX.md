# IBERFIT M26 · RC22 State, Performance & UX

RC22 endurece la experiencia local sin desplegar ni modificar producción.

## Cambios principales

- Reintentos automáticos con backoff exponencial y límite de cinco minutos.
- Reintento manual inmediato desde el Centro de verificación.
- Persistencia de `attempts` y `nextRetryAt` sin exponer payloads.
- Operaciones offline selladas por usuario y esquema; contaminación cruzada eliminada.
- Migración segura de registros legacy del repositorio offline.
- Coordinador latest-task para cancelar trabajos obsoletos y evitar carreras de importación wearable.
- Renderizado del shell agrupado en microtareas y sin escrituras DOM idénticas.
- Store canónico sin notificaciones redundantes y con listeners aislados.
- Evaluación inicial inmediata de conectividad, deduplicación online/offline y coalescencia durante sync.
- Enlace “Saltar al contenido”, `aria-current` correcto, regiones vivas, `aria-busy` y respeto por movimiento reducido.
- Vista previa wearable con acciones seguras: añadir contexto al check-in, descargar resumen sin datos crudos y descartar.
- Versionado runtime, cabecera `x-client-info` y Service Worker alineados con RC22.

## Límites y garantías

- Solo validación local; `deployable=false`.
- No se activan integraciones pagadas.
- No se afirma conexión real con Health Connect, Google Health, Apple, Garmin u Oura.
- No se escribe en Supabase ni Cloudflare.
- M25.1/M25.2 y los 122 archivos protegidos permanecen intactos.
- Los datos wearable no producen diagnósticos ni cambios automáticos de carga.

## Gates externos pendientes

1. Comparación autenticada exacta del registro remoto de 52 comandos.
2. Cuentas QA reales Coach y Cliente.
3. Health Connect en Android físico y revisión OAuth restringida de Google.
4. Pruebas en iPhone, Android y tablet físicos.
5. Canario remoto observado y rollback M25.1 ensayado.
