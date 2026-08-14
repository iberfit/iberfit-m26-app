# RC59.0C2C — Canonical Telemetry Apply Evidence

RC59_0C2C_CANONICAL_TELEMETRY_APPLY=PASS
BASE_COMMIT=553769b801fbf823f3b59ddf2883ae6b6d1fd83e
CANONICAL_PROJECT_REF=pjhmrhejsoofmouedavw
OBSERVED_AT_UTC=2026-08-14T22:00:35.654521Z

## Estado remoto observado

El preflight canónico inmediatamente anterior al apply mostró los nueve objetos
`v59` ausentes.

Después, un intento de ejecución devolvió:

`M26_RC59_TELEMETRY_ALREADY_PRESENT`

Ese intento falló en la precondición del candidato antes de cualquier DDL de ese
intento.

El diagnóstico read-only posterior confirmó que el backend canónico ya contenía
los nueve objetos esperados y que sus definiciones correspondían al candidato
RC59.0C2B.

DUPLICATE_APPLY_FAIL_CLOSED=PASS
ROLLBACK_REQUIRED=FALSE
REPEAT_APPLY_REQUIRED=FALSE

## Objetos canónicos

V59_EXPECTED_OBJECTS=9
V59_PRESENT_OBJECTS=9
V59_ABSENT_OBJECTS=0

Objetos observados:

- `public.m26_telemetry_events_v59`
- `public.m26_telemetry_import_batches_v59`
- `public.m26_telemetry_can_access_client_v59(uuid)`
- `public.m26_telemetry_json_safe_v59(jsonb)`
- `public.m26_telemetry_event_valid_v59(jsonb,uuid,text,text)`
- `public.m26_telemetry_import_v59(jsonb)`
- `public.m26_telemetry_read_page_v59(uuid,timestamptz,integer)`
- `public.m26_telemetry_delete_own_v59(timestamptz)`
- `public.m26_telemetry_purge_expired_v59()`

## Seguridad

Ambas tablas nuevas tienen:

- RLS habilitada;
- FORCE RLS habilitada;
- owner `postgres`;
- sin privilegios directos SELECT/INSERT/UPDATE/DELETE para `authenticated`;
- sin SELECT/INSERT para `anon`.

RAW_TABLE_RLS=PASS
BATCH_TABLE_RLS=PASS
RAW_TABLE_FORCE_RLS=PASS
BATCH_TABLE_FORCE_RLS=PASS
DIRECT_TABLE_PRIVILEGES_AUTHENTICATED=FALSE
DIRECT_TABLE_PRIVILEGES_ANON=FALSE

Las policies raw observadas son:

- SELECT para `authenticated`, condicionado a cliente propio o
  `m26_telemetry_can_access_client_v59(client_id)`;
- INSERT para `authenticated`, condicionado a `imported_by = auth.uid()` y el
  mismo límite de cliente propio/asignación.

ADMIN_ROLE_ALONE_RAW_ACCESS=FALSE
GLOBAL_IS_ASSIGNED_COACH_REUSED_FOR_TELEMETRY=FALSE

## Frontera Coach

`m26_telemetry_can_access_client_v59(uuid)`:

- SECURITY DEFINER;
- `search_path=''`;
- executable por `authenticated`;
- no executable por `anon`;
- cliente propio mediante `iberfit_client_id()`;
- Coach solo con asignación activa;
- membership activa;
- vigencia `starts_at` / `ends_at`;
- `coach_user_id = auth.uid()`.

TELEMETRY_SPECIFIC_AUTH_HELPER=PASS
ACTIVE_COACH_ASSIGNMENT_REQUIRED=TRUE
ACTIVE_MEMBERSHIP_REQUIRED=TRUE

## RPC y helpers

Permisos observados:

- import: authenticated EXECUTE = true; anon = false;
- read: authenticated EXECUTE = true; anon = false;
- delete-own: authenticated EXECUTE = true; anon = false;
- purge: authenticated EXECUTE = false; anon = false;
- event validator: authenticated EXECUTE = false;
- recursive JSON privacy guard: authenticated EXECUTE = false.

IMPORT_RPC_PRIVILEGES=PASS
READ_RPC_PRIVILEGES=PASS
DELETE_OWN_RPC_PRIVILEGES=PASS
PURGE_RPC_NOT_EXPOSED=PASS
INTERNAL_VALIDATORS_NOT_EXPOSED=PASS

## Contrato persistido

La tabla raw observada conserva:

- `(client_id,event_id)` UNIQUE;
- `event_type = heart_rate_sample`;
- providers live:
  `apple_health`, `wear_os_health_services`, `ble_direct`;
- `recorded_at` y `received_at` como `timestamptz`;
- `canonical_event` JSONB;
- `expires_at`;
- foreign keys a `clients` y `auth.users`.

Los constraints remotos verifican igualdad tipada:

- `canonical_event.recordedAt::timestamptz = recorded_at`;
- `canonical_event.receivedAt::timestamptz = received_at`.

TIMESTAMP_TYPED_EQUALITY=PASS
RECEIVED_AT_INVARIANT=PASS

La implementación remota de import contiene:

- `now() + interval '180 days'`;
- límite de 100 eventos;
- límite de 192000 bytes;
- rechazo intra-batch `M26_RC59_BATCH_EVENT_ID_DUPLICATE`;
- ACK granular accepted / duplicate / rejected;
- colisión `M26_RC59_EVENT_ID_COLLISION`.

RAW_RETENTION_DAYS=180
RETENTION_CLOCK=INGESTION_TIME
INTRA_BATCH_EVENT_ID_UNIQUENESS=PASS
ACK_GRANULARITY=PER_EVENT

## Índices

Observados:

- `(client_id, recorded_at DESC, event_id)`;
- `(client_id, execution_id, recorded_at, event_id)`;
- `expires_at`;
- batch `(client_id, created_at DESC)`;
- PK/UNIQUE correspondientes.

INDEX_CONTRACT=PASS

## Estado de producto

BACKEND_MUTATION=TRUE
SUPABASE_CANONICAL_TOUCHED=TRUE
PRODUCTION_SCHEMA_CHANGED=TRUE
APPLICATION_RUNTIME_CHANGED=FALSE
PWA_CACHE_CHANGED=FALSE

El backend queda preparado para conectar el outbox durable local de RC59.0C1 con
`public.m26_telemetry_import_v59(jsonb)`.

NEXT_PRODUCT_ACTION=RC59_0C3_REMOTE_OUTBOX_UPLOAD_RUNTIME
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY

El polish visual del checkpoint Cliente / Coach / Admin permanece pendiente:
menos severidad visual, secundarios menos grises y acentos cálidos/semánticos,
sin convertir IBERFIT en una interfaz multicolor.