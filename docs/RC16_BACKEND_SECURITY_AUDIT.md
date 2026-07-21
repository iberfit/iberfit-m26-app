# RC16 · Auditoría de backend y seguridad

## Alcance

La candidata usa exclusivamente los RPC canónicos `iberfit_bootstrap_v26`, `iberfit_command_preflight_v26` e `iberfit_execute_command_v26`. La lectura del registro se limita a `domain_command_registry_v26`, con un máximo de 100 filas y autenticación obligatoria.

## Controles reforzados

- El origen Supabase se deriva del `projectRef` y debe coincidir exactamente con `https://<projectRef>.supabase.co`.
- Se rechazan credenciales embebidas, rutas, consultas, fragmentos y protocolos distintos de HTTPS.
- Los encabezados de autenticación protegidos no pueden ser reemplazados por opciones del llamador.
- Las solicitudes usan `credentials: omit`, `cache: no-store`, `redirect: error` y `referrerPolicy: no-referrer`.
- El Command Bus aplica single-flight por `operationId`, valida tamaño/serialización y no presenta operaciones pendientes como confirmadas.
- Las notas privadas no se guardan en cola offline y requieren conexión, rol autorizado y ACK remoto.
- La PWA excluye autenticación, REST, RPC, funciones y configuración de runtime de cualquier caché.
- La CSP no admite `unsafe-inline`; la aplicación se entrega con `X-Frame-Options: DENY` y Service Worker confinado a `/m26/`.

## Estado remoto

No se capturó el esquema remoto porque el conector Supabase estaba deshabilitado. Se incluye `backend/RC16_REMOTE_SCHEMA_READONLY.sql` para obtener definiciones, firmas, columnas, RLS y políticas sin modificar la base. No se autoriza migración hasta comparar ese resultado con las 52 definiciones exactas de `qa/rc16_command_registry.json`.
