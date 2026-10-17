# M44 — Certificación independiente de recuperación y promoción segura

## Estado comprobado (16-10-2026 UTC)

El respaldo cifrado M44 de producción fue exportado y restaurado de manera aislada en el run de GitHub Actions `38833678711`, SHA `e0a89cff70794dbd77624fceb42932fca521bb11`. Se verificaron 126 objetos de Storage y el archivo cifrado se transfirió a Drive privado. El SHA-256 del ZIP verificado fue `e60d46bc0973836449d3e3e6ee16be74a7923b18642fca27689414394fbc1f7a`. **No se guardan IDs privados de Drive, tokens o nombres de usuarios/clientes en el repositorio público.**

El backup del workflow usa `pg_dump -Fc --no-owner --no-acl`, y `pg_restore --no-owner --no-acl`. Por ello, el restore correcto **no** acredita por sí mismo propiedad de objetos, GRANT/REVOKE, roles/globales, parámetros Auth alojados, correos/SMTP, claves JWT o un RTO medido. No asumir recuperación integral del proyecto.

## Puerta de copia externa: contrato técnico

`scripts/ops/m44_offsite_recovery_proof.mjs` implementa un verificador exclusivamente de lectura, diseñado para ejecutarse en un contexto servidor autorizado:

1. Comprueba por API de GitHub que el run corresponde al repositorio, workflow y rama exactos, está concluido correctamente y tiene menos de 48 horas.
2. Demuestra que el SHA de ese backup es ancestro del SHA exacto que se propone promocionar: nunca admitir un backup de un repositorio o rama divergente.
3. Comprueba conclusión exitosa de exportación, cifrado, descifrado/restauración aislada, subida cifrada y limpieza.
4. Consulta el digest SHA-256 del artefacto cifrado de Actions.
5. Consulta Drive mediante OAuth autorizado, requiere ZIP no compartido, un único permiso `owner` de la cuenta corporativa, archivo en la carpeta privada esperada y tamaño coherente.
6. **Descarga el ZIP de Drive en streaming** para recalcular SHA-256 y compararlo con el artefacto, sin revelar contenido ni escribir el ZIP en el repositorio.
7. Devuelve evidencia tipada y reconoce explícitamente `platformRecoveryVerified:false` cuando no existe ensayo completo de roles/Auth.

Los datos de GitHub o Drive nunca deben aceptarse de una variable booleana, un objeto autorreferido o un manifiesto editable. Un token inválido o incompleto bloquea; la evidencia no puede producirse desde el frontend.

**Importante:** en este checkpoint NO hay integración operativa de las credenciales privadas de Drive en el workflow protegido; la herramienta rechazó modificar ese límite. La implementación está aislada en PR y **no habilita por sí sola producción**. El gate gestionado existente permanece en funcionamiento y falla cerrado en Supabase Free. No fusionar declarando `PROD READY` sin comprobar efectivamente la llamada al servicio autorizado.

## Recuperación operativa aún no acreditada

- Capture el inventario de roles globales, membresías, propietarios, grants, default privileges, RLS, vistas y `SECURITY DEFINER` **dentro del material cifrado** (sin incluir contraseñas ni volcar datos en logs).
- Ensaye restauración de grants/propiedad con la imagen y componentes compatibles de Supabase, sin alterar PROD.
- Compare huellas de tablas, constraints, índices y políticas de origen y destino; confirme denominadores coherentes, tablas `auth` y metadatos Storage.
- Valide los objetos reales de Storage y la reconstrucción de los buckets/policies.
- Documente restauración de Auth gestionado, configuraciones de correo/dominios y claves operativas a través de un procedimiento de custodia independiente.
- Acredite conservación separada de la clave de cifrado, recuperación desde Drive y una segunda ubicación independiente según RPO/RTO definidos.
- Mantenga rollback de despliegue, tabla de migraciones y operaciones SQL trazables; no use un backup viejo como protección suficiente para escrituras posteriores.
- En cada despliegue o prueba de recuperación, verifique explícitamente el proyecto de destino para **no escribir en PROD** durante el ensayo.

## Evidencia de recuperación: dos niveles que no se deben confundir

**Nivel 1: archivo externo.** La copia puede certificarse como `offsiteBytesVerified=true` cuando el run correcto, las pruebas de descifrado y el ZIP privado descargado coinciden en hash. Esta evidencia sigue siendo útil aunque el proyecto no pueda restaurarse enteramente.

**Nivel 2: recuperación integral de la plataforma.** Solo podrá quedar en verde tras un ensayo adicional que demuestre roles/membresías, propietarios, privilegios/default ACL, políticas RLS, Auth y configuraciones operativas compatibles. Hasta entonces el código deja `platformRecoveryVerified=false` y **la ruta externa rechaza la autorización productiva con `M44_PROD_BACKUP_PLATFORM_RECOVERY_UNVERIFIED`**, aunque las verificaciones del Nivel 1 pasen. Ningún cambio de estado de un PR reemplaza un ensayo técnico.

La ventana de prueba general del archivo es de hasta 48 horas, pero **el preflight de una migración productiva exige un backup externo de menos de 2 horas**. Además, hay que realizar y conservar una copia después de cualquier migración antes de considerar cerrada la ventana de reversión. Si la captura de Storage y PostgreSQL no ocurre en el mismo instante, documentar el punto de consistencia y los cambios concurrentes; no afirmar atomicidad distribuida.

### Particularidades Supabase

De acuerdo con [Supabase, Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), una migración de plataforma exige tratar **roles** de forma diferenciada, y la restauración de Vault hacia un nuevo proyecto debe considerar la clave raíz de cifrado. La [guía de backups](https://supabase.com/docs/guides/platform/backups) recuerda que los ficheros de Storage no forman parte del dump SQL y que las credenciales de roles personalizados deben restablecerse. No guardar claves raíz o contraseñas en texto plano ni en GitHub.

**Criterio de aceptación operativo:** recuperar el respaldo desde Drive y la clave desde custodia independiente en un sandbox; ensayar Auth y sesiones representativas sin datos sensibles en logs; contrastar permisos y RLS con el inventario de origen; comprobar referencia de Storage sin errores; generar informe de certificación de RPO/RTO, versión y SHA. No crear nuevos proyectos Supabase de pago para la prueba.

## Huella de recuperación PostgreSQL / Auth (control P0)

Se incorpora `scripts/ops/m44_platform_recovery_catalog.sql`: consulta **solo de lectura** válida en PostgreSQL 17 que devuelve un único objeto JSON con **doce SHA-256**, sin nombres de clientes, datos de tablas, secretos, funciones fuente ni relaciones de acceso en el resultado. Abarca roles y capacidades de superusuario, membresías, relaciones/propietarios/ACL/RLS, privilegios por defecto, funciones y su código resumido, políticas, triggers, constraints, índices, extensiones, configuración de buckets y migraciones.

`scripts/ops/m44_platform_recovery_compare.mjs` compara esos doce resúmenes entre el origen y **una restauración real aislada**. Rechaza diferencias, digest inválidos, categorías inventadas y el intento de usar la misma ruta como ambos extremos. El comparador emite solamente nombres de categorías distintas; jamás hashes ni datos privados. Su resultado en caso de igualdad es `catalogParity=true`, pero deliberadamente **`platformRecoveryVerified=false`**.

Para el ensayo aislado, capturar el JSON del origen y el destino en archivos temporales de permisos 0600, separados físicamente, mediante `psql -X -A -t -v ON_ERROR_STOP=1 -f scripts/ops/m44_platform_recovery_catalog.sql`. Compararlos con `node scripts/ops/m44_platform_recovery_compare.mjs ORIGEN.json RESTAURADO.json`. El origen solo admite lectura; no se debe enviar una consulta de esta clase contra un destino de producción como si fuera sandbox. Borrar ambos archivos privados tras el ensayo. No almacenar el contenido de catálogos ni contraseñas en el repositorio público.

**Observación del 16/10/2026 (solo lectura):** la consulta se ejecutó en Supabase PROD y QA y produjo diez huellas válidas por entorno (en la versión inicial de la consulta; la versión actual añade constraints e índices). Coincidieron `roles` y `extensions`; difirieron `policies`, `triggers`, `role_memberships`, `function_security`, `migration_history`, `relation_security`, `default_privileges` y `bucket_configuration`. Esto es compatible con el desfase de M44 y las diferencias reales entre entornos; **NO es un ensayo de restauración** y no debe interpretarse como fallo de un restore.

Las huellas son necesarias pero no suficientes: no comprueban contenido de filas ni usuarios, claves de cifrado Vault, configuración alojada Auth, proveedores SMTP, JWT, Edge Functions, RTO/RPO, archivos físicos de Storage ni la procedencia del sandbox. Estos aspectos siguen requiriendo evidencias diferenciadas. El `pg_restore --no-owner --no-acl` canónico puede restablecer tablas sin propietarios ni concesiones originales; por eso una restauración SQL correcta no equivale a conservar el modelo de acceso. La documentación oficial de Supabase describe exportación separada de roles y restauración de elementos gestionados: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.

## Promoción

M44 tiene 12 migraciones presentes en QA y ausentes de PROD en este checkpoint. El workflow `production-promote.yml` no ejecuta esas migraciones: exige el esquema **ya aplicado** antes del frontend. No ejecutar una promoción parcial ni omitir esos gates.

Antes de tocar PROD: copia reciente recuperable, validación de integridad por tablas, auditoría de migraciones, plan de reversión, ensayo de roles/permisos y aprobación técnica del estado exacto SHA. Después: validar el mismo SHA en Canary, permisos por rol, informe IRI inicial **separado** de evolución, PDFs, Storage, Edge, clientes reales y recuperación de errores.

**Política:** ningún permiso amplio, `service_role` en navegador ni exención incondicional del gate para salvar un error de despliegue. No son necesarias suscripciones de pago.


### Endurecimiento de lectura de los catálogos privados

Al comparar las doce huellas, `m44_platform_recovery_compare.mjs` abre cada evidencia mediante un único descriptor de archivo y rechaza enlaces simbólicos, archivos enlazados mediante hardlink, tamaños anómalos o cambios de metadatos observables durante la lectura. En sistemas POSIX exige que el archivo no conceda permisos a grupo ni a terceros (por ejemplo, `0600`). En Windows se conserva la validación de archivo regular y se requiere controlar el acceso mediante ACL del sistema, sin inferir seguridad a partir de bits POSIX. Los errores no imprimen las rutas, digest o contenidos.

Esto impide aceptar por accidente determinados archivos de evidencia no privados o sustituidos, pero **no demuestra la procedencia del snapshot**, no impide todas las alteraciones concurrentes ni acredita aislamiento del PostgreSQL de destino, autenticación alojada o recuperación integral. Los dos catálogos deben proceder de extracciones realmente independientes, custodiadas y verificadas. `platformRecoveryVerified=false` permanece obligatorio.

### Cobertura explícitamente incompleta de la versión 1 de doce huellas

El resumen de `relation_security` de la versión archivada incorpora `pg_class.relacl`, propietarios y RLS, pero **no incluye expresamente** las ACL de esquemas (`pg_namespace.nspacl`) ni las ACL por columna (`pg_attribute.attacl`). Dos catálogos con las mismas doce huellas podrían, por ello, tener diferencias de acceso efectivo. El comparador expone ahora `schemaAclVerified=false`, `columnAclVerified=false` y `effectivePrivilegesVerified=false`, incluso ante coincidencia total. Esto es un límite del contrato **v1** del backup, no un permiso para reinterpretar respaldos anteriores con otro algoritmo silenciosamente. Antes de certificar recuperación deberá acreditarse por separado que las ACL de esquema/columna y las operaciones reales de roles limitados coinciden, o introducir una evolución versionada y retrocompatible del catálogo.


### Verificación directa de bytes desde Drive (16/10/2026; generación más reciente de la carpeta)

Se inspeccionó mediante acceso autenticado de Drive la carpeta de copias generales cifradas: **cinco generaciones** accesibles. La generación más reciente que figuraba en esa carpeta se creó a las `2026-10-16T10:44:43.988Z` y corresponde al run de GitHub Actions [38888628869](https://github.com/iberfit/iberfit-m26-app/actions/runs/38888628869), sobre Canary. El fichero ZIP tiene **32.143.146 bytes**. El archivo, su carpeta contenedora y las carpetas ascendentes hasta Mi unidad figuraban como no compartidos, con un único permiso `owner` por cada elemento consultado.

Se descargó el ZIP **desde Drive**, no desde GitHub, se calculó su SHA-256 localmente y se contrastó contra el digest publicado por GitHub Actions para el artefacto original, sin exponer identificadores privados de Drive:
`3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd`.

La inspección sin extraer contenidos confirmó un único miembro denominado `iberfit-prod-recovery.ibf`, de **32.133.172 bytes**, con cabecera exacta `IBFBAK01`. Se comprobó asimismo que los tres jobs del workflow de backup original figuraban con conclusión `success`. Tras el cotejo se eliminó el ZIP temporal del entorno local de verificación.

**Alcance:** `offsiteCiphertextBytesVerified=true` para esa generación y momento; el checksum acredita identidad de bytes con el artefacto original, no autenticidad AES-256-GCM sin la clave. **No se descifró** el contenido, ni se ejecutó `pg_restore`, ni se verificaron los roles y ACL operativos, Auth alojado, Vault, JWT, Storage restaurado en entorno independiente, inicio de sesión por perfil o RTO/RPO. Por tanto `latestGenerationIndependentDecryptionVerified=false`, `platformRecoveryVerified=false`, `rtoCertified=false`, `rpoCertified=false` y la promoción M44 permanece bloqueada. Los permisos visibles de Drive son una instantánea; no garantizan por sí solos la recuperación futura ni excluyen riesgos de cuenta o proveedor.


## Huellas complementarias ACL versión 1, sin reescribir el catálogo histórico

Se agrega un **archivo SQL separado** `scripts/ops/m44_access_acl_supplement_v1.sql` que devuelve solamente tres digest SHA-256 y su identificador de esquema `iberfit.m44.access-acl-supplement.v1`: `schema_acl` (propietario y `pg_namespace.nspacl`), `column_acl` (`pg_attribute.attacl` por relación/columna), y `database_acl` (permisos `pg_database.datacl`, propietario y restricciones de conexión sobre la base actual). Abarca esquemas no internos; no devuelve nombres de objetos, contraseñas, funciones, filas o claves en claro. Se mantiene **intacto** el SQL histórico de doce huellas.

El comparador anterior sigue aceptando **dos** archivos v1 con su misma salida. Opcionalmente acepta **cuatro** archivos privados en este orden: catálogo fuente v1, catálogo recuperado v1, suplemento ACL fuente, suplemento ACL recuperado. Exige rutas físicamente distintas, formatos estrictos, permisos locales privados y coincidencia de cada categoría; si falta solo uno de los suplementos, falla cerrado. La salida completa se reduce a `IBERFIT_PLATFORM_CATALOG_PARITY_ONLY:true:aclSupplementParity:true:hosted_auth_NOT_certified`; jamás devuelve digest ni nombre privado de objeto. Ejemplo conceptual (solo archivos de un par origen/restore con custodia y procedencia verificadas):

`node scripts/ops/m44_platform_recovery_compare.mjs origen-v1.json restaurado-v1.json origen-acl.json restaurado-acl.json`

El workflow aislado `.github/workflows/m44-access-acl-sidecar-synthetic.yml` comprueba en PostgreSQL 17, con `--network none` y sin puertos publicados, que introducir por separado `GRANT USAGE ON SCHEMA`, `GRANT SELECT(columna)` y `GRANT CONNECT ON DATABASE` produce divergencia **solo en su digest respectivo**. Es una comprobación sintética de cobertura, nunca una lectura ni escritura de PROD o QA.

**Interpretación rigurosa:** aun si los doce digest originales y los tres adicionales coinciden, `effectivePrivilegesVerified=false` y `platformRecoveryVerified=false`. No se asegura que la instantánea fuente corresponda al mismo momento MVCC del archivo cifrado ni que se hayan recuperado datos, identidades, Auth alojado, MFA, Vault, secretos, Storage físico, APIs o RTO/RPO. El suplemento se captura de forma autenticada y separada para evitar interpretar como certificado un hash sin procedencia; solo se podrá usar para evidencia real cuando se obtenga y se ate a un backup real con la misma instantánea. La igualdad de hashes es necesaria pero insuficiente.


### Paridad de permisos con nombre de base de recuperación diferente

El PostgreSQL recuperado suele crear una base con nombre propio (por ejemplo, `iberfit_recovery_test`) aunque la copia original proceda de `postgres`. La primera versión del suplemento incluía `pg_database.datname` dentro del material de `database_acl`, lo que causaba una **divergencia falsa inevitable** entre permisos idénticos cuando los nombres cambiaban. Se ha corregido el SQL suplementario todavía no integrado: restringe la consulta mediante `d.datname=current_database()`, pero **no incorpora `datname` a la huella**. Sí mantiene `datdba`, `datacl`, `datallowconn` y `datconnlimit`. El nombre se comprueba separadamente cuando una operación realmente exige identidad nominal; una comparación de permisos para recuperación no debe exigirla.

El ensayo PostgreSQL 17 ahora crea dos bases sintéticas con diferentes nombres, replica su estructura y exige **igualdad de las tres huellas** cuando coinciden las ACL, antes de introducir mutaciones independientes que deben volver a detectarse. Este ajuste conserva intactos los doce digest originales y el contenido/cifrado de los backups existentes. No añade pruebas de Auth ni RTO/RPO y no declara recuperación certificada.
