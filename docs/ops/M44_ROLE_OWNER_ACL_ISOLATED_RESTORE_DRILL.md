# M44 — Ensayo aislado de recuperación de propietarios, ACL y RLS

## Propósito y límites

Las copias históricas se generaron con `pg_dump -Fc --no-owner --no-acl` y se verificaron inicialmente con `pg_restore --no-owner --no-acl`. En formato personalizado de PostgreSQL 17, `pg_dump --no-owner` es ignorado (los propietarios siguen referenciados en el TOC), mientras que `pg_dump --no-acl` **elimina los GRANT/REVOKE del archivo**. El nuevo backup M44 omite ambas opciones en `pg_dump -Fc`, conserva esas ACL y sigue haciendo el primer restore **deliberadamente** con `pg_restore --no-owner --no-acl` para comprobar los datos sin aplicar permisos a ciegas. El archivo global cifrado `global-roles.sql` preserva definiciones de roles sin contraseñas; no restituye por sí mismo permisos de cada tabla.

`scripts/ops/m44_synthetic_acl_restore_drill.sh` y `.github/workflows/m44-role-acl-synthetic-drill.yml` ejecutan una prueba adversarial íntegramente **sintética** en PostgreSQL 17, sin obtener credenciales ni hacer consultas a PROD/QA:

1. Crear exclusivamente roles ficticios `iberfit_m44_fixture_owner` y `iberfit_m44_fixture_reader`, tres bases de datos ficticias y dos filas de ejemplo sin información personal.
2. Registrar en origen propietario de esquema y tabla, `GRANT USAGE` en esquema, `GRANT SELECT` en tabla, `ALTER DEFAULT PRIVILEGES`, RLS activo y política que restringe la lectura a una sola fila.
3. Exportar en formato personalizado con `pg_dump -Fc` y recuperar el primer destino con `pg_restore --no-owner --no-acl`. Deben persistir las dos filas, pero falla el acceso real del rol lector y difieren los permisos.
4. Recuperar el segundo destino con `pg_restore --no-owner` **sin `--no-acl`**, y reconciliar explícitamente propietarios sintéticos. Verificar coincidencia de siete propiedades estructurales y que `SET ROLE` permite leer exactamente una de las dos filas.
5. Fallar de manera cerrada si el restore empobrecido conserva inesperadamente permisos o si el restaurado corregido no coincide con el origen.

Los roles del ensayo se crean en el mismo clúster aislado porque en Supabase real debe gestionarse la existencia de los roles administrados antes de aplicar permisos. **Esta prueba no demuestra recreación de roles en un clúster nuevo ni restaura la copia productiva**, y no valida ningún secreto, login o proveedor de Auth. En particular **no cambia `platformRecoveryVerified=false`** ni el gate de M44 hacia PROD.

## Próxima prueba necesaria con una copia real

Usando exclusivamente el respaldo cifrado autenticado, en un sandbox PostgreSQL 17 **sin red y no compartido**, contrastar las 12 categorías del catálogo source con una reconstrucción de propietarios/ACL y aplicar una comprobación de acceso representativa por rol. Para la copia nueva, el dump personalizado incluye los propietarios y ACL y permite revisar un segundo restore **en sandbox** con el conjunto de roles previamente reconciliado. Las huellas SHA por categoría, por sí solas, siguen siendo insuficientes. La restauración operativa exige comparar catálogos, privilegios y sesiones como usuarios limitados; nunca ejecutar automáticamente un replay de roles y GRANT contra producción. Las copias históricas generadas con `--no-acl` no recuperan retroactivamente estas entradas. El verificador externo estricto mantiene el mismo formato TAR y no se debe declarar `platformRecoveryVerified=true` por este cambio.

Los pasos no deben ejecutarse directamente sobre `app.iberfit.cl` o `pjhmrhejsoofmouedavw`. Tampoco hay que eliminar o restablecer las sesiones de Auth de QA sin un cambio separado y autorizado. Véase https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.


## Ensayo adicional: replay selectivo, sin volver a importar datos

El drill PostgreSQL 17 ahora certifica dos vías independientes:

- **Reinstalación completa de un dump sintético con ACL:** `pg_restore --no-owner`, seguido de reconciliación explícita de propietarios.
- **Recuperación por etapas sobre la base inicialmente desprovista de ACL:** genera una lista privada con `pg_restore --list`, conserva únicamente registros cuyo tipo sea exactamente `ACL` o `DEFAULT ACL`, comenta todas las demás entradas y aplica `pg_restore --use-list` a **la misma base ya restaurada**. Después reconcilia el propietario ficticio, compara las siete propiedades del catálogo con el origen, comprueba `SET ROLE` y que la política RLS solo muestra una de dos filas. La importación de privilegios no debe importar de nuevo tablas, datos, funciones ni políticas.

El ensayo exige ambos tipos de registro y falla ante divergencia. El TOC privado se elimina; no se exponen nombres de objetos del archivo. Sigue siendo exclusivamente **sintético y confinado a localhost**. El siguiente paso con el respaldo real requiere reconciliar los roles gestionados del PostgreSQL de destino y comprobar las doce huellas independientes y Auth alojado, sin ejecutar SQL de producción fuera de un sandbox seguro. Este ensayo no modifica el gate de despliegue ni afirma que el procedimiento sea seguro para ejecutarlo sobre PROD.


## Comprobación estricta del TOC del respaldo real (fase sin replay)

`scripts/ops/m44_acl_toc_selector.mjs` transforma una lista privada de `pg_restore --list` en otra lista **únicamente con entradas tipo `ACL` y `DEFAULT ACL`**. Cada entrada distinta queda comentada, incluidos `TABLE DATA`, `TABLE`, `FUNCTION`, `POLICY`, `TRIGGER` y cambios de propietario. Rechaza formato inesperado, IDs repetidos, ausencia de cualquiera de los dos tipos y caracteres de control; no incluye nombres de objetos en errores ni mensajes.

En el workflow de respaldo productivo se ejecuta **después** de descifrar el archivo autenticado y antes de `pg_restore --no-owner --no-acl`. La lista privada se elimina una vez comprobada, **no se ejecuta** contra producción ni QA y no se publica junto al ZIP. Su propósito es acreditar que el respaldo cifrado real permite preparar una recuperación limitada de permisos. El uso de `--use-list` sigue demostrándose exclusivamente con las dos filas sintéticas en PostgreSQL 17.

**Límite:** validar la lista no equivale a restaurar ACL operativas, propietarios ni roles; tampoco certifica Auth gestionado, JWT, Vault, sesiones, SMTP u OAuth. Un archivo `pg_dump` podría ejecutar SQL controlado por su origen, por lo que el replay de un backup real requiere además procedencia autenticada, contenedor sin red, roles conciliados y comparación del catálogo con pruebas de acceso por rol. No se modifica `platformRecoveryVerified=false`.
