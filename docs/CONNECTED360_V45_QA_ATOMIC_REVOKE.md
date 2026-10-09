# Connected 360 v45 — revocación y borrado atómicos (QA exclusivo)

**Situación real:** `20261009223143_connected360_v45_atomic_revoke_erase_qa` aplicada a Supabase QA `gjztkdwfmunnzhtvxrsu` mediante `apply_migration`. No se ha aplicado a PROD. SQL conservado textualmente desde `supabase_migrations.schema_migrations`; esta carpeta **NO** forma parte de las migraciones comunes.

## Problema corregido
`m26_wearable_revoke_v44` antes adquiría el candado de `iberfit:wfence:v1` dentro de triggers de conexión/consentimiento. Si no existía conexión para un proveedor, borrar resúmenes podía comenzar antes de obtener el bloqueo, mientras otra importación estaba en curso. En QA ahora adquiere un advisory xact lock por actor/cliente **antes** de las mutaciones, utilizando exactamente la misma clave del importador autorizado.

El nuevo trigger interno `m26_wearable_v45_cleanup_after_revoke_qa_v1` elimina la fuente v45 en la **misma transacción** que un evento de consentimiento `delete`. También elimina toda la huella v45 en caso de revocación global `*` proveniente de `delete_all_v44`, incluso cuando no existían filas/relaciones v44 para un proveedor. Un `revoke` sin opción de borrar no borra el historial, pero mantiene la revocación del consentimiento.

## Barrera de no escritura
`m26_wearable_v45_block_unverified_write_qa_v1` rechaza todo `INSERT/UPDATE` con código SQLSTATE `42501`. Está protegido incluso ante una inserción por un rol técnico con permisos para la tabla. `anon/authenticated` no tienen ACL sobre v45, las funciones trigger no tienen `EXECUTE` para roles públicos y v45 conserva `ENABLE+FORCE RLS`. No hay RPC de importación v45, ni contador nuevo ni sincronización.

## Validación remota
- Las tres definiciones de trigger están instaladas en sus tablas reales.
- La función de limpieza es `SECURITY DEFINER SET search_path=''`, sin concesión `EXECUTE` a `anon/authenticated`. Solo se ejecuta como trigger sobre tablas ya protegidas por RLS.
- La prueba SQL negativa intentó introducir un registro sintético y verificó el rechazo `M26_CONNECTED360_V45_INGEST_UNCERTIFIED`; no insertó datos.
- `m26_wearable_revoke_v44`: comprobado el orden candado → actualización.
- v44/v45 continúan con **cero registros** en QA; PROD no posee tabla v45.

## Limitaciones y siguiente fase
El recorrido físico de Android, el origen acreditado del reloj, el borrado verificado sobre una muestra de datos sintéticos y las pruebas de concurrencia con dos sesiones **aún no están certificados**. La función `revoke_v44` de PROD **no se ha modificado**. No habilitar nuevos roles, escrituras ni sync hasta validar la futura RPC/trigger de importación real con grant UUID actual, scopes y cursor de revocación.

Rollback manual bajo `supabase/qa-rollbacks/`, condicionado a **cero filas** y que conserva el bloqueo de escritura deliberadamente. No ejecutar fuera de QA.
