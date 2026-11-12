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


## Cobertura adicional de escrituras aisladas (sin datos reales)

El ensayo sintético ahora crea un tercer rol ficticio sin inicio de sesión, `iberfit_m44_fixture_writer`, con permisos SQL `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre una tabla con dos filas ficticias de ámbitos distintos. Las cuatro políticas RLS permiten exclusivamente `tenant_id = 1` para este rol. Así se comprueba la diferencia entre un `GRANT` SQL existente y un acceso real permitido por política.

La prueba ejecuta con `SET LOCAL ROLE` las cuatro operaciones y verifica: lectura de una sola fila, inserción del propio ámbito, rechazo explícito por RLS de inserción fuera del ámbito, actualización propia, invisibilidad de la fila ajena, rechazo de reasignación de ámbito y borrado permitido/denegado según el ámbito. Las operaciones se ejecutan dentro de transacciones con `ROLLBACK`; los errores se clasifican localmente sin registrar filas. Se comprueba el origen sintético, el destino recreado con ACL y el destino inicialmente desprovisto de permisos tras el replay selectivo de ACL. Antes del replay, este último debe negar el acceso.

La ampliación **no usa ni verifica los datos auténticos del respaldo externo**, no demuestra aislamiento de Cliente/Coach/Admin en IBERFIT real, no reconstruye Auth gestionado y **no modifica** `platformRecoveryVerified=false`, la promoción a PROD ni los procedimientos de otro frente. El resultado válido exige ejecución de PostgreSQL 17 en CI; un test de texto o una revisión estática no bastan.


## Aislamiento reforzado del ensayo sintético

El workflow `.github/workflows/m44-role-acl-synthetic-drill.yml` ejecuta ahora PostgreSQL 17 Supabase y el cliente `psql/pg_dump/pg_restore` en **un mismo contenedor temporal Docker con `--network none` y sin `--publish`**. La comunicación SQL se limita a `127.0.0.1` dentro del propio contenedor. Se comprueba con `docker inspect` que el modo de red sea `none` y con `docker port` que no existan puertos publicados. La descarga previa de la imagen por Docker puede utilizar la red del host, pero el contenedor en ejecución no dispone de conectividad exterior. El contenedor, las bases ficticias y el directorio temporal se destruyen con una trampa de limpieza al finalizar.

La comprobación de sintaxis `sh -n`, los tests herméticos y la ejecución PostgreSQL 17 deben pasar. Este endurecimiento **no convierte el ensayo sintético en una restauración de la copia real de IBERFIT** ni modifica el bloqueo de PROD.


## Prueba funcional específica de ACL de esquema y columna

La prueba sintética conserva además una concesión `SELECT(content)` **únicamente a nivel de columna**, con `USAGE` del esquema y RLS que limita la lectura a la fila del ámbito 1. Este actor debe recuperar la lectura de `content`, pero no puede consultar `tenant_id`. Un segundo actor dispone de `GRANT SELECT` sobre toda la tabla y de una política RLS permisiva, pero **carece de `USAGE` del esquema**; PostgreSQL debe rechazar su consulta expresamente por permiso de esquema. Así se distinguen la ACL del esquema, el permiso de tabla, el permiso de columna y RLS.

La matriz se comprueba en origen ficticio, restauración completa y restauración por replay selectivo. El primer restore con `--no-acl` tiene que negar la lectura del actor con concesión por columna. El catálogo sintético pasa de siete a doce propiedades verificadas, incorporando capacidades explícitas de ambos roles.

Esta prueba demuestra que el `pg_dump` sintético conserva esas ACL y que se pueden reproducir en PostgreSQL 17. **No llena automáticamente las lagunas del catálogo de huellas v1 de una copia real**; esas verificaciones siguen pendientes, al igual que la continuidad operativa Auth/Storage/Vault y los accesos por rol de IBERFIT en un destino recuperado.

Como protección adicional frente a falsos positivos, el control de lectura por columna exige **exactamente una fila visible**, no solo que el último valor devuelto coincida. Después de las pruebas DML se valida en cada base ficticia la identidad y el contenido exacto de ambas filas; una actualización que hubiera escapado a un `ROLLBACK` causaría fallo cerrado aunque el recuento continuase siendo dos.


## Segunda prueba: restauración hacia un clúster PostgreSQL 17 NUEVO

`scripts/ops/m44_fresh_cluster_role_restore_drill.sh` y el job `m44-fresh-cluster-roles-acl-rls-proof` preparan **dos contenedores Supabase PostgreSQL 17 independientes**, con `--network none`, ningún puerto publicado y datos exclusivamente ficticios. El clúster de destino empieza sin los tres roles del fixture.

En el origen se crean rol propietario, lector y coach ficticio con membresía heredada; se exportan `pg_dumpall --roles-only --no-role-passwords` y `pg_dump -Fc`. Antes de restaurar, se comprueba que el archivo de roles contiene los roles esperados y no declara contraseñas. **No se ejecuta jamás `global-roles.sql` contra el destino.** Únicamente se reconcilian tres roles sintéticos previamente permitidos y su membresía, para evitar el replay ciego de roles gestionados. Después se aplica el dump ficticio al clúster nuevo y se cotejan propietarios, `GRANT`, `ALTER DEFAULT PRIVILEGES`, membresía, RLS, consultas como lector/coach y contenido exacto de las dos filas.

La nueva prueba complementa, sin reemplazar, el drill original de tres bases de datos dentro de un mismo clúster. **No recupera usuarios reales ni passwords de roles, Auth alojado, claves JWT, Vault, Storage ni Edge Functions**. Tampoco acredita la recuperación de roles gestionados en una instancia Supabase nueva, migración productiva ni RTO/RPO. Mantiene `platformRecoveryVerified=false` y no ejecuta ninguna consulta ni escritura sobre PROD o QA.


## Prueba adicional de restauración segura de funciones SECURITY DEFINER

El laboratorio de **clúster nuevo y sin red** también crea una función SQL ficticia `SECURITY DEFINER`, con propietario explícito, `search_path` acotado, `REVOKE EXECUTE FROM PUBLIC` y `GRANT EXECUTE` únicamente al rol coach del fixture. Tras `pg_restore` verifica en origen y destino la propiedad, `prosecdef`, la configuración segura de ruta, la ACL real de ejecución y la ausencia de privilegios de `LOGIN`, `BYPASSRLS` y `SUPERUSER` de los cuatro roles ficticios. Una invocación del coach debe devolver solo el agregado de la fila autorizada; las invocaciones desde lector o intruso deben fallar específicamente por permiso de función. Este control previene que una restauración estructuralmente correcta se dé por buena cuando cambia una frontera de ejecución privilegiada.

**Alcance:** prueba funcional sintética, no auditoría automática de todas las funciones reales, no ejecución de un dump productivo ni validación de Auth, JWT, Vault, Storage o RTO/RPO. La copia real y su custodia permanecen fuera del laboratorio; `platformRecoveryVerified=false`.
