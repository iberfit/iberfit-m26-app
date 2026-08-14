# RC59.0C1 — Local Durable Telemetry Outbox

RC59_0C1_LOCAL_DURABLE_TELEMETRY_OUTBOX=PASS
BASE=c26277c9d0b1e7b3ac14e16121dde796db60477e
SCOPE=LOCAL_DURABILITY_NO_REMOTE_UPLOAD

## Resultado

La telemetría canónica live aceptada en RC59.0B se stagea inmediatamente en un
outbox local owner-scoped.

El outbox utiliza la infraestructura key-value existente con una base IndexedDB
separada:

- DB: `iberfit-m26-telemetry`;
- store: `outbox_v1`;
- fallback seguro a session/memory provisto por `createBrowserKeyValueStore`.

No se modifica el Command Bus.

COMMAND_BUS_REUSED_FOR_SAMPLES=FALSE

## Ownership

El owner del outbox es `session.user.id`, no `clientId`.

Esto permite que:

- un Cliente almacene sus eventos;
- un Coach pueda trabajar con varios clientes;
- dos usuarios del mismo navegador no vean la cola local del otro.

## Stage

Cuando el controller live acepta un evento canónico:

1. permanece en el bounded timeline RAM;
2. se stagea de inmediato en el outbox durable;
3. el estado live legacy continúa funcionando.

Si IndexedDB/storage falla:

- la sesión no se interrumpe;
- el timeline RAM y FC live continúan;
- se emite `M26_TELEMETRY_OUTBOX_STAGE_FAILED`.

## Crash / replay

El registro durable conserva:

- ownerId;
- clientId;
- sessionId;
- executionId;
- eventId;
- idempotency key;
- evento canónico;
- estado;
- timestamps;
- attempts;
- nextRetryAt;
- lastErrorCode.

Recrear el outbox con el mismo owner/storage recupera los eventos pendientes.

Un replay idéntico del mismo `clientId + eventId` es idempotente.
Un payload distinto con esa identidad falla con
`M26_TELEMETRY_EVENT_ID_COLLISION`.

## Capacidad y pruning

Se mantienen los límites del contrato RC59.0C:

- máximo 20.000 registros;
- máximo 7 días de backlog local.

Los registros expirados se purgan.

Si la cola continúa llena después del pruning, no se expulsan silenciosamente
muestras pendientes: el nuevo stage falla con
`M26_TELEMETRY_OUTBOX_CAPACITY_EXCEEDED`.

## ACK granular

`applyBatchAck`:

- accepted → remove;
- duplicate → remove;
- rejected → terminal local;
- no mencionado → permanece pending.

Un ACK no puede mencionar un event ID fuera del batch.

## Retry

Fallos transitorios:

- conservan pending;
- incrementan attempts;
- calculan exponential backoff;
- no vuelven a `batches()` hasta `nextRetryAt`.

Fallos terminales quedan observables como `terminal` y no se reintentan.

## Deliberadamente fuera de C1

REMOTE_UPLOAD_IMPLEMENTED=FALSE
BACKEND_MUTATION=FALSE
SUPABASE_SCHEMA_CHANGED=FALSE
RLS_CHANGED=FALSE
RPC_CHANGED=FALSE
SESSION_SNAPSHOT_CHANGED=FALSE
AI_CHANGED=FALSE
GRAPHS_CHANGED=FALSE

## Siguiente implementación

RC59.0C2 debe preparar, revisar y solo después aplicar de forma controlada:

- migración SQL raw telemetry;
- unique `(client_id,event_id)`;
- RLS por identidad/asignación;
- RPC/import con ACK granular;
- delete/export;
- retención raw 180 días;
- rollback;
- transport web;
- flush del outbox;
- pruebas duplicate/retry/403/429/5xx;
- verificación read-only antes de tocar Supabase.

## Gates

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC59_0C1_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

NEXT_PRODUCT_ACTION=RC59_0C2_TELEMETRY_BACKEND_MIGRATION_READ_ONLY_DESIGN
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY