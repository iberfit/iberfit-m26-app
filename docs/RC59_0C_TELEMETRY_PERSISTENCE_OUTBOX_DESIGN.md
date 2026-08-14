# RC59.0C — Telemetry Persistence / Outbox Design

RC59_0C_TELEMETRY_PERSISTENCE_OUTBOX_DESIGN=PASS
BASE=e80287c3520d1dfd48dbeab102389c7ba7e71e0e
SCOPE=PURE_PERSISTENCE_CONTRACT_NO_BACKEND_MUTATION

## Decisión

La telemetría de alta frecuencia no utiliza un Command Bus operation por muestra.

El Command Bus sigue reservado para comandos de dominio. La telemetría utiliza un
outbox específico con eventos canónicos e idempotencia por evento.

COMMAND_BUS_REUSED_FOR_SAMPLES=FALSE

## Identidad e idempotencia

Identidad durable:

`iberfit.telemetry.remote.v1:{clientId}:{eventId}`

La base remota debe imponer unicidad por:

- `clientId`;
- `eventId`.

Un replay idéntico se reconoce como duplicate, no como error.

## Batching

Valores de contrato iniciales:

- máximo 100 eventos por request;
- máximo 192.000 bytes serializados por batch;
- un batch nunca mezcla clientes, sesiones ni ejecuciones;
- ACK granular por evento.

El servidor debe devolver conjuntos explícitos:

- accepted event IDs;
- duplicate event IDs;
- rejected event IDs.

Solo accepted/duplicate salen del outbox.

## Outbox local

Contrato inicial:

- owner-scoped;
- máximo 20.000 eventos pendientes;
- edad máxima local pendiente: 7 días;
- replay con el mismo event ID es idempotente;
- separación total del repositorio de Command Bus.

RC59.0C1 implementará este outbox sobre la infraestructura key-value ya existente.

## Retención durable

RAW_RETENTION_DAYS=180

Los eventos crudos de alta frecuencia tienen retención inicial de 180 días.
Los agregados/derivaciones que sean útiles longitudinalmente se almacenan por
separado y pueden tener otra política de retención.

La política final de privacidad/export/delete debe poder eliminar raw y derivados
de forma coherente.

## Autorización esperada

Raw telemetry:

- Cliente: solo su propio `clientId`;
- Coach: solo clientes con asignación activa;
- Admin: no obtiene raw por defecto.

Admin conserva metadata operacional necesaria para salud del sistema, no el detalle
sanitario crudo.

La autorización no se decide por un `role` enviado por el cliente; se resuelve
server-side mediante identidad y relaciones activas.

## Privacidad

DEVICE_ID_PERSISTED=FALSE

No se persisten MAC, GATT IDs ni identificadores únicos de hardware dentro del evento
canónico.

## Retry

Terminal inicial:

- 400;
- 401;
- 403;
- 404;
- 409;
- 413;
- 422.

Retry:

- 408;
- 425;
- 429;
- 5xx;
- errores de red.

Un evento terminal rechazado no se reintenta en bucle; debe quedar observable para
diagnóstico sin exponer payload sensible.

## Deliberadamente no implementado aquí

BACKEND_MUTATION=FALSE
SUPABASE_SCHEMA_CHANGED=FALSE
RLS_CHANGED=FALSE
RPC_CHANGED=FALSE
LOCAL_DURABLE_OUTBOX_IMPLEMENTED=FALSE
LIVE_INGESTION_WIRING_CHANGED=FALSE
SESSION_SNAPSHOT_CHANGED=FALSE
AI_CHANGED=FALSE
GRAPHS_CHANGED=FALSE

## Implementación siguiente

RC59.0C1:
- repositorio local durable owner-scoped;
- stage inmediato desde ingestión;
- pruning;
- batching;
- ACK granular;
- offline/retry;
- tests de crash/replay.

RC59.0C2:
- migración SQL guardada;
- tabla raw;
- unique/idempotencia;
- RLS;
- RPC/import endpoint;
- delete/export;
- rollback;
- verificación read-only antes de cualquier apply.

## Gates

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC59_0C_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

NEXT_PRODUCT_ACTION=RC59_0C1_LOCAL_DURABLE_TELEMETRY_OUTBOX
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY