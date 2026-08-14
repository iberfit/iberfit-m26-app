# RC59.0C2 — Telemetry Backend Migration Read-Only Design

RC59_0C2_TELEMETRY_BACKEND_MIGRATION_READ_ONLY_DESIGN=PASS
BASE=7111d973c02652eafc6bfd0f39eb1410ff03af00
SCOPE=DESIGN_ARTIFACTS_ONLY

## Estado

BACKEND_MUTATION=FALSE
SUPABASE_TOUCHED=FALSE
SUPABASE_SCHEMA_CHANGED=FALSE
RLS_CHANGED=FALSE
RPC_CHANGED=FALSE
PRODUCTION_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE

MIGRATION_AUTO_APPLY_RISK=BLOCKED

El draft SQL NO está dentro de `supabase/migrations/`.

Además, migration y rollback comienzan con una transacción y un sentinel que lanza
una excepción antes de cualquier DDL. No son archivos ejecutables de despliegue.

## Evidencia reutilizada

El diseño se apoya en contratos ya existentes:

- `public.iberfit_client_id()` para alcance Cliente;
- `public.is_assigned_coach(uuid)` para Coach con asignación activa;
- RLS y RPC autenticados de RC43/RC44;
- contrato de idempotencia RC59.0C;
- outbox owner-scoped RC59.0C1.

No se usa un role enviado por frontend para autorizar.

## Tablas propuestas

### `public.m26_telemetry_events_v59`

Raw immutable telemetry con:

- `client_id`;
- `event_id`;
- `session_id`;
- `execution_id`;
- `event_type`;
- `source_provider`;
- `recorded_at`;
- `received_at`;
- `canonical_event`;
- `imported_by`;
- `created_at`;
- `expires_at`.

Unique durable:

`(client_id,event_id)`

El `canonical_event` preserva el envelope RC59.0A completo.

No existe filtro fisiológico 25–240 sobre el dato raw.

RAW_RETENTION_DAYS=180

### `public.m26_telemetry_import_batches_v59`

Metadata operacional por batch:

- actor;
- cliente;
- sesión;
- ejecución;
- número recibido;
- accepted;
- duplicate;
- rejected;
- bytes;
- timestamp.

PER_SAMPLE_GENERIC_AUDIT_TRIGGER=FALSE

No se utiliza `m26_audit_row_v43()` por muestra para evitar duplicar una corriente
de alta frecuencia. La provenance vive en el evento y la operación se audita por batch.

## Providers live iniciales

- `apple_health`;
- `wear_os_health_services`;
- `ble_direct`.

Los providers históricos diarios RC44 siguen siendo otra capa.

## Privacidad

La validación recursiva rechaza:

- token/secrets;
- email/teléfono/nombre;
- `deviceId`;
- MAC;
- GATT IDs;
- seriales de hardware.

DEVICE_ID_PERSISTED=FALSE

## Autorización

Import y lectura raw:

- Cliente sobre su propio `client_id`;
- Coach solo mediante `public.is_assigned_coach(client_id)`.

ADMIN_ROLE_ALONE_RAW_ACCESS=FALSE

Una persona que también tenga rol Coach solo accede cuando exista una asignación
Coach activa; el rol Admin no concede raw por sí mismo.

La tabla raw mantiene RLS como defensa en profundidad, pero sus privilegios directos
para `authenticated` quedan revocados. La API prevista son RPCs explícitos.

## Import RPC

`public.m26_telemetry_import_v59(jsonb)`

Límites:

- máximo 100 eventos;
- máximo 192.000 bytes;
- un cliente/sesión/ejecución por batch.

ACK:

- `acceptedEventIds`;
- `duplicateEventIds`;
- `rejectedEventIds`;
- `rejectedReasons`.

Replay idéntico:

duplicate.

Mismo `(client_id,event_id)` con contenido distinto:

`M26_RC59_EVENT_ID_COLLISION`.

## Read / export

`public.m26_telemetry_read_page_v59(...)`

Página máxima 1.000 eventos.

Autorización:

Cliente propio o Coach asignado.

## Delete

`public.m26_telemetry_delete_own_v59(...)`

Solo Cliente sobre su propia identidad resuelta server-side.

Coach y Admin no pueden borrar raw ajeno.

## Retention

`public.m26_telemetry_purge_expired_v59()`

No se concede a `authenticated`.

Está pensado para ejecución controlada/scheduler después de revisar la política final.

## Rollback

Existe draft separado que elimina:

- RPCs;
- raw table;
- batch metadata table;
- validators/helpers RC59.

También está protegido por sentinel.

## Preflight siguiente

`docs/sql/RC59_0C2_CANONICAL_PREFLIGHT_READ_ONLY.sql`

Es estrictamente read-only y revisa:

- objetos requeridos;
- helpers de scope;
- definiciones reales de `iberfit_client_id` e `is_assigned_coach`;
- RLS actual;
- policies actuales;
- ausencia/presencia de objetos RC59 antes de aplicar.

No contiene:

- CREATE;
- ALTER;
- DROP;
- INSERT;
- UPDATE;
- DELETE;
- GRANT;
- REVOKE.

## Gate antes de cualquier apply

No convertir el draft en migración ejecutable hasta que el preflight del proyecto
canónico confirme:

1. proyecto correcto;
2. helpers esperados;
3. RC46 assignment boundary vigente;
4. ausencia de colisión con objetos `v59`;
5. RLS/policies compatibles;
6. rollback revisado.

## Gates de este commit

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC59_0C2_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

PWA_CACHE_CHANGED=FALSE
APPLICATION_RUNTIME_CHANGED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

NEXT_PRODUCT_ACTION=RC59_0C2A_CANONICAL_BACKEND_PREFLIGHT_READ_ONLY
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY