# RC59.0B — Live Ingestion + Bounded Timeline

RC59_0B_LIVE_INGESTION_BOUNDED_TIMELINE=PASS
BASE=629edf4203613a3c42f69b83b4b4df0ac819e3de
SCOPE=LOCAL_LIVE_INGESTION_ONLY

## Objetivo

Conectar la telemetría live existente al contrato canónico RC59.0A sin introducir
todavía persistencia remota, agregaciones longitudinales, gráficas o IA.

Cada muestra live sigue dos caminos separados:

1. dato crudo válido estructuralmente → evento canónico → timeline local;
2. normalizador legacy RC52 → FC visible y agregados live actuales.

Esto permite conservar outliers crudos con su calidad sin contaminar la FC media,
mínima o máxima que usa hoy la experiencia live.

## Timeline bounded

El timeline local utiliza:

- máximo por defecto: 7.200 eventos;
- ventana temporal por defecto: 6 horas;
- eventos canónicos inmutables;
- contadores accepted/rejected/evicted;
- pruning por edad y capacidad;
- resumen sin exponer la lista completa.

Estos límites son guards de memoria de RC59.0B, no política durable de retención.

## Correlación

Si una muestra declara `executionId` o `sessionId` diferente del contexto activo:

- no entra al timeline;
- no entra a agregados legacy;
- incrementa rejected;
- produce diagnóstico;
- no modifica prescripción.

## Dato crudo y visualización

Un BPM finito fuera de 25–240 puede existir en el evento canónico si la fuente lo
entrega y su calidad lo contextualiza.

El normalizador legacy conserva su contrato histórico: puede rechazar ese valor
para la UI/agregados live.

Los RR crudos canónicos no se convierten a VFC.

## Provenance

La ingestión transmite al evento canónico el transporte resuelto por el bridge
cuando existe (`native-webview`, canal equivalente, etc.).

Se conserva provider/providerId lógico, plataforma, transporte y device type.
No se incorpora `deviceId`/MAC al evento canónico.

## Persistencia

REMOTE_PERSISTENCE_CHANGED=FALSE
SUPABASE_SCHEMA_CHANGED=FALSE
COMMAND_BUS_CHANGED=FALSE
CANONICAL_STORE_CHANGED=FALSE
SESSION_SNAPSHOT_CHANGED=FALSE

El timeline vive dentro de `execution.liveTelemetry`, que continúa excluido del
snapshot operativo remoto.

RC59.0C definirá:

- almacenamiento durable;
- batching;
- outbox;
- idempotencia;
- retención;
- límites por sesión;
- deduplicación;
- política offline/retry;
- RLS y autorización.

## Producto y seguridad

PRESCRIPTION_AUTOMATION_CHANGED=FALSE
AI_CHANGED=FALSE
GRAPHS_CHANGED=FALSE
CLINICAL_DECISION_AUTOMATION=FALSE
DEVICE_ID_PERSISTED=FALSE

La IA no interpreta todavía estos eventos y ningún dato modifica automáticamente
carga, volumen, ejercicio, RPE objetivo o RIR objetivo.

## Gates

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC59_0B_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

NEXT_PRODUCT_ACTION=RC59_0C_TELEMETRY_PERSISTENCE_OUTBOX_DESIGN
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY