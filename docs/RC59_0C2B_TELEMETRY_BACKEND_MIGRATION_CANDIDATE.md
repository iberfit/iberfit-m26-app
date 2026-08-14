# RC59.0C2B — Guarded Telemetry Backend Migration Candidate

RC59_0C2B_GUARDED_TELEMETRY_BACKEND_MIGRATION_CANDIDATE=PASS
BASE=55d048e2a13941a30ee0f55e75aec9f82ef05054
SCOPE=EXECUTABLE_CANDIDATE_OUTSIDE_SUPABASE_MIGRATIONS

## Estado

RC59.0C2A confirmó el backend canónico real y detectó drift de autorización.
Ese drift quedó resuelto en el diseño mediante una frontera raw específica:

- Cliente propio;
- o asignación Coach activa;
- membership activa;
- vigencia temporal;
- `coach_user_id = auth.uid()`;
- rol Admin por sí solo no concede raw.

AUTHORIZATION_DRIFT_RESOLVED=TRUE
GLOBAL_IS_ASSIGNED_COACH_REUSED_FOR_TELEMETRY=FALSE
ADMIN_ROLE_ALONE_RAW_ACCESS=FALSE

## Candidato ejecutable

La migración candidata vive en:

`docs/sql/RC59_0C2B_TELEMETRY_BACKEND_MIGRATION_CANDIDATE.sql`

El rollback candidato vive en:

`docs/sql/RC59_0C2B_TELEMETRY_BACKEND_ROLLBACK_CANDIDATE.sql`

Ambos permanecen fuera de `supabase/migrations/`.

MIGRATION_IN_SUPABASE_MIGRATIONS=FALSE
ROLLBACK_IN_SUPABASE_MIGRATIONS=FALSE
REMOTE_APPLY=FALSE
BACKEND_MUTATION=FALSE
SUPABASE_TOUCHED=FALSE
PRODUCTION_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE

## Doble barrera contra ejecución accidental

El candidato ya no contiene el sentinel de diseño porque debe ser sintácticamente
ejecutable, pero exige una autorización local explícita en la misma sesión/transacción:

`iberfit.rc59_0c2_apply_authorized = RC59_0C2B_AUTHORIZED`

El rollback exige una bandera distinta:

`iberfit.rc59_0c2_rollback_authorized = RC59_0C2B_ROLLBACK_AUTHORIZED`

Sin esas banderas, ambos fallan antes de DDL destructivo o persistente.

EXECUTION_AUTHORIZATION_GUARD=PASS
ROLLBACK_AUTHORIZATION_GUARD=PASS

## Correcciones de C2B

### Igualdad temporal real

El draft comparaba el texto JSON `recordedAt` contra `recorded_at::text`.
Eso es frágil porque PostgreSQL puede representar el mismo instante con un formato
textual diferente.

C2B compara `timestamptz` real:

- `recordedAt` ↔ `recorded_at`;
- `receivedAt` ↔ `received_at`.

TIMESTAMP_TYPED_EQUALITY=PASS
RECEIVED_AT_INVARIANT=PASS
TEXTUAL_TIMESTAMPTZ_EQUALITY=FALSE

### Retención desde ingestión

Los 180 días se calculan desde la persistencia del evento (`now()`), no desde el
reloj de origen del sensor.

Esto evita que un reloj de dispositivo incorrecto extienda o acorte la retención
raw sin alterar el timestamp original preservado.

RAW_RETENTION_DAYS=180
RETENTION_CLOCK=INGESTION_TIME
RAW_RECORDED_AT_PRESERVED=TRUE

### Colisiones fail-closed

Además de las dos tablas, el candidato aborta si ya existe cualquiera de los
helpers/RPC `v59` previstos. No usa `create or replace` para reinterpretar
silenciosamente un despliegue parcial existente.

V59_OBJECT_COLLISION_GUARD=PASS

### Idempotencia intra-batch

Un mismo `eventId` no puede repetirse dos veces dentro del mismo batch remoto.
Se rechaza el batch con:

`M26_RC59_BATCH_EVENT_ID_DUPLICATE`

Esto evita ACK ambiguos donde el mismo identificador pudiera aparecer
simultáneamente como accepted y duplicate/rejected.

INTRA_BATCH_EVENT_ID_UNIQUENESS=PASS

### Postchecks de seguridad

El cierre transaccional comprueba:

- RLS activa en ambas tablas;
- FORCE RLS activa en ambas tablas;
- `authenticated` sin SELECT/INSERT/UPDATE/DELETE directo sobre raw o batch audit;
- import/read/delete con EXECUTE para authenticated;
- purge sin EXECUTE para authenticated.

FORCE_RLS_POSTCHECK=PASS
DIRECT_TABLE_PRIVILEGES_AUTHENTICATED=FALSE
PURGE_AUTHENTICATED_EXECUTE=FALSE

## Contratos que no cambian

- raw BPM válido se preserva incluso fuera de 25–240;
- RR inválido estructuralmente se rechaza;
- `deviceId`, MAC, GATT, serial, secretos y PII indebida siguen bloqueados;
- `(client_id,event_id)` sigue siendo la unicidad remota;
- ACK sigue siendo granular por evento;
- batch máximo 100 eventos / 192000 bytes;
- raw y derivados permanecen separados;
- no hay auditoría genérica por cada muestra.

RAW_FACTS_IMMUTABLE=TRUE
DERIVED_METRICS_SEPARATE=TRUE
PER_SAMPLE_GENERIC_AUDIT_TRIGGER=FALSE

## Checkpoint visual

El checkpoint visual Cliente / Coach / Admin ya se realizó antes de C2B.

La dirección visual general fue aceptada con una corrección pendiente para el pase
de polish: mantener la base premium verde/oscura, pero reducir severidad mediante
acentos semánticos y cálidos, superficies tintadas y CTAs menos planos, evitando
una interfaz multicolor.

VISUAL_CHECKPOINT_COMPLETED=TRUE
VISUAL_DIRECTION_ACCEPTED=TRUE
VISUAL_POLISH_PENDING=TRUE

## Gates

FOCUSED_CANDIDATE_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
APPLICATION_RUNTIME_CHANGED=FALSE
PWA_CACHE_CHANGED=FALSE
PHONE_COMPILE=SKIPPED_NO_RUNTIME_CHANGE
WEAR_COMPILE=SKIPPED_NO_RUNTIME_CHANGE

NEXT_PRODUCT_ACTION=RC59_0C2C_CANONICAL_APPLY_PREP_GUARDED
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY