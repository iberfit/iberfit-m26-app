# Connected 360 · v7 veracidad de importación manual

**Origen verificado en QA y PROD** (09/10/2026): `m26_wearable_import_authorized_v2` estaba guardando `syncEnabled=true`, `lastSyncedAt=now()` y `metadata.mode=confirmed_import` al incorporar un archivo o al aceptar una importación puntual Android QA. Ninguno de esos procesos crea un enlace permanente ni garantiza actualización automática; los hechos almacenados contradicen la semántica de la interfaz.

## Cambio aditivo sin pérdida de funcionalidad

- La autorización de la fuente continúa activa y se mantiene ligada a su `grantId`, al mismo bloqueo advisory y al fence anti-revocación existente.
- Después de importar, `sync_enabled=false`, `last_synced_at=NULL`, `metadata.mode='confirmed_import'`, `metadata.automatic=false` y `metadata.lastImportedAt=NOW()`. Esta hora documenta **recepción por IBERFIT**, no medición o actualización del reloj.
- `m26_wearable_connection_upsert_v44` sigue registrando consentimiento `grant` al incorporar datos explícitamente con `mode=confirmed_import` aunque no haya sincronización automática. Los otros estados `paused/revoked` y el caso genérico `syncEnabled=false` mantienen su comportamiento anterior.
- Ninguna modificación del esquema, RLS, JWT, permisos, identidades, datos históricos, contrato de retorno ni ruta v45. Las dos funciones siguen siendo SECURITY INVOKER.
- La migración verifica hashes exactos de las definiciones ya observadas en QA/PROD; si otro flujo las cambia primero, falla antes de modificar cualquiera. El despliegue debe certificar QA, recuperar esquema/backup y aplicar en PROD tras las pruebas.
- El modelo Cliente ya distingue visualmente archivos importados frente a fuentes nativas certificadas. La integración Android física y la frescura v45 siguen pendientes.

**QA/PROD no tienen filas en `m26_wearable_connections_v44` ni `m26_wearable_daily_summaries_v44` al inspeccionar**. Aun así la migración no modifica filas preexistentes para evitar efectos inesperados.

## Validación requerida

`node --test tests/m26_connected360_manual_import_truth_v7.test.mjs tests/m26_connected360_v2_explicit_consent.test.mjs`, CI, data-safety gate, QA SQL canónico (definiciones, ACL, RLS, eventos) y prueba de revocación. Después desplegar frontend de la misma fuente en Canary/PROD sin activar funciones nativas de salud.
