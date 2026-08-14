# RC59.0A — Canonical Telemetry Contract

RC59_0A_CANONICAL_TELEMETRY_CONTRACT=PASS
BASE=50b1423624832160d6f2fedf9d7807c9da01c072
SCOPE=PURE_CANONICAL_CONTRACT_FOUNDATION

## Objetivo

Definir una única forma canónica de representar telemetría de sesión antes de
conectar ingestión live, persistencia, agregaciones, gráficas o IA.

La regla de producto es:

**dato crudo → contexto → derivación separada → interpretación → entrenador decide**

## Contrato

Cada evento de frecuencia cardíaca conserva:

- `clientId`;
- `sessionId`;
- `executionId`;
- `recordedAt`;
- `receivedAt`;
- fase;
- `blockId`;
- `exerciseId`;
- número de serie;
- provider;
- providerId cuando es un identificador lógico no sensible;
- plataforma;
- transporte;
- tipo de dispositivo;
- calidad legacy;
- calidad canónica cuando existe;
- estado de contacto;
- BPM crudo;
- RR crudos;
- provenance de captura.

## Preservación del dato

RC57.6A ya conserva BPM nativo incluso cuando está fuera del rango fisiológico
esperado y lo marca mediante calidad. RC59.0A extiende esa filosofía a la capa web.

No se recorta, redondea ni sustituye un BPM finito por estar fuera de 25–240.
No se convierten RR en VFC.
No se genera una VFC implícita.
No se introduce `derived` dentro del evento crudo.

RR estructuralmente inválidos se rechazan como muestra inválida; no se filtran
silenciosamente para fabricar una muestra aparentemente limpia.

## Privacidad mínima

El contrato no conserva `deviceId`/MAC en el evento canónico por defecto.
La provenance funcional utiliza provider, providerId lógico, tipo de dispositivo,
plataforma y transporte.

## Inmutabilidad

Evento, contexto, source, quality, raw, RR y provenance se congelan de forma profunda.

## Deliberadamente fuera de 59.0A

LIVE_INGESTION_CHANGED=FALSE
REMOTE_PERSISTENCE_CHANGED=FALSE
SUPABASE_SCHEMA_CHANGED=FALSE
COMMAND_BUS_CHANGED=FALSE
CANONICAL_STORE_CHANGED=FALSE
SESSION_SNAPSHOT_CHANGED=FALSE
AI_CHANGED=FALSE
GRAPHS_CHANGED=FALSE

La telemetría live actual continúa siendo efímera durante esta subetapa.

## Entrega RC59.0

- RC59.0A: contrato canónico puro e inmutable.
- RC59.0B: ingestión live y timeline local acotado.
- RC59.0C: persistencia/outbox, retención, idempotencia y tamaño.

No se utilizará el snapshot operativo completo de ejecución como contenedor ingenuo
de telemetría de alta frecuencia.

## Gates

ENCODING_REGRESSION_GUARD=PASS
PWA_APP_SHELL_CHECK=PASS
RC59_0A_FOCUSED_TESTS=PASS
FULL_APP_TEST_SUITE=PASS
PHONE_COMPILE=PASS
WEAR_COMPILE=PASS

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE
COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE

NEXT_PRODUCT_ACTION=RC59_0B_LIVE_INGESTION_BOUNDED_TIMELINE
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY