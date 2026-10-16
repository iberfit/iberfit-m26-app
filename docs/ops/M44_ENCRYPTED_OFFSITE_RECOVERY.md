# M44 · Recuperación cifrada de IBERFIT (PostgreSQL + Storage)

**Objetivo:** generar fuera de Supabase una copia cifrada de las estructuras y filas PostgreSQL (incluidas tablas `auth` y `storage`) y todos los bytes de Storage. Verificar su descifrado, integridad y restauración en un PostgreSQL 17 **aislado**, sin escribir ni restaurar jamás sobre producción. El IRI inicial y los historiales de seguimiento permanecen separados.

## Seguridad y precondiciones

Workflow: `.github/workflows/m44-encrypted-disaster-recovery.yml`. En PR ejecuta tests criptográficos y una restauración real con datos sintéticos, sin credenciales ni PII. Tras integrar el workflow en Canary, inicia la copia de producción en runner efímero protegido. Nunca sube `pg_dump`, ficheros de Storage, manifests con rutas ni logs privados sin cifrar.

Credenciales **solo en secretos de GitHub Actions**, nunca en repositorio/PR/chat/variables públicas:
- `IBERFIT_PROD_DATABASE_URL`: cadena de conexión PostgreSQL a producción usando usuario con capacidad legal de leer los esquemas necesarios, ref `pjhmrhejsoofmouedavw`, `sslmode=require` o `verify-full`. Se admite pooler *session*, no *transaction*.
- `IBERFIT_PROD_STORAGE_SERVICE_KEY`: clave servidor del mismo Supabase PROD para leer objetos privados. Proteger con acceso restringido; jamás bundle de navegador.
- `IBERFIT_BACKUP_PASSPHRASE`: secreto aleatorio de alta entropía (mínimo 32 caracteres), conservado también de forma segura **fuera de GitHub** para recuperación independiente. Perderlo vuelve inutilizable el archivo cifrado. No usar contraseñas del usuario ni claves de producción reutilizadas.

El acceso de conectores disponible no permite crear estos secretos en GitHub ni obtener el password real de PostgreSQL. Si faltan, el workflow falla cerrado antes de exportar. No se deben mostrar secretos en logs.

## Recorrido certificable

1. Verificar destino PROD y TLS y secretos protegidos.
2. Exportar `pg_dump -Fc` y obtener inventario de `storage.objects` dentro del runner, sin mostrar filas en los logs.
3. Descargar cada objeto privado desde Storage, preservando solo dentro de la copia su ruta original, tamaño y SHA-256. Cada archivo se almacena con nombre local opaco.
4. Empaquetar PostgreSQL + Storage en TAR local, cifrar en streaming con scrypt y AES-256-GCM; borrar material sin cifrar inicial.
5. Descifrar dentro de un segundo directorio aislado, verificar autenticidad y hashes de cada archivo; restaurar el dump en PostgreSQL 17 de prueba por `pg_restore --exit-on-error --no-owner --no-acl`. No retornar datos de usuarios ni SQL en logs.
6. Publicar **solo archivo .ibf verificado**, temporalmente en GitHub Actions (retención máxima: **1 día**). El repositorio de código es público: el ZIP cifrado se transfiere en cuanto esté disponible a la **carpeta privada de Google Drive de IBERFIT**, bajo titular `iberfit.cl@gmail.com`, compartida con nadie; verificar permisos de acceso y tamaño del archivo. GitHub no constituye el repositorio durable de recuperación. Emitir `IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS` solo si ambas validaciones pasan.
7. Después de transferir el archivo cifrado a Drive privado, verificar que puede recuperarse sin exponer la clave, su checksum, contenido comprimido y la retención. Mantener una segunda copia offline si se requiere protección frente a borrado de la cuenta de Drive. Antes de autorizar M44 PROD, verificar también la restauración de sistemas gestionados Supabase (Auth, extensiones y buckets) y documentar RTO/RPO.

## Bloqueos deliberados

- Proyecto/destino equivocado, falta de TLS, password, clave Storage, objeto ausente, descarga parcial, hash alterado, tamaño excesivo, fallo de `pg_dump`, de cifrado o `pg_restore` => no hay certificación integral.
- El primer ensayo real confirmó que `pg_dump` + 126 objetos Storage + AES-256-GCM funcionaron, pero el restore genérico PostgreSQL 17 falló por falta de `supabase_vault` (instalada en PROD, versión `0.3.1`). La imagen de ensayo se ha igualado a `supabase/postgres:17.6.1.147` y ahora se verifica la presencia del archivo de control Vault. **Solo un restore real completado certifica la recuperación**; no se infiere éxito por una prueba sintética.
- La imagen Supabase de ensayo puede tener otras dependencias o roles gestionados; si `pg_restore` falla, conservar errores detallados únicamente en el runner privado, no imprimir SQL o identificadores personales, y ajustar la restauración **sin tocar producción**.
- El backup de PostgreSQL guarda metadatos de `storage.objects` pero no los bytes: por eso el exportador Storage es obligatorio y se verifica independientemente.
- Si el archivo cifrado no está almacenado fuera de Supabase y su clave no está custodiada externamente, no hay evidencia suficiente de recuperación ante desastre.
- La mera ejecución con estado verde de la CI de código no desbloquea `production-promote.yml`; los 12 cambios M44 siguen bloqueados hasta documentar las evidencias de restauración real y acceso a backup.

## Evidencia mínima

SHA fuente exacto; run del workflow; número de objetos verificados y tamaño cifrado (nunca rutas ni contenido), pg_restore aislado concluido, copia cifrada externa localizable y prueba de recuperación de clave independiente, inventario de versión y fecha de backup, snapshot de estado inmutable y checklist de recuperación Auth/Storage; QA Canary positivo y revisión de seguridad post-release.

## Certificación de consistencia Storage / base de datos (16-10-2026)

La exportación M44 exige ahora la igualdad de **tres inventarios de metadatos** y el contenido de un cuarto manifiesto:

1. **Inventario PostgreSQL antes de descargar:** `storage.objects` con `bucket_id`, `name`, `id`, `version`, `updated_at` UTC y `metadata.size`. Solo en el workspace privado.
2. **Inventario PostgreSQL después de descargar:** los mismos campos. Un alta, baja, reemplazo de objeto o cambio de metadatos durante el proceso provoca fallo cerrado antes de cifrar.
3. **Inventario del PostgreSQL restaurado aisladamente:** consulta contra `127.0.0.1` y `iberfit_recovery_test`, **nunca** contra producción. Debe coincidir con la primera captura; evita aceptar metadatos que no pertenecen al `pg_dump`.
4. **Manifiesto de archivos descargados:** nombres y buckets deben coincidir exactamente; `m44_storage_backup_bytes.mjs verify` coteja además cada tamaño y SHA-256 de los archivos.

Se ejecutan `scripts/ops/m44_storage_metadata_parity.mjs source` antes de cifrar y `... isolated` después de `pg_restore`. Ante divergencia solo se muestra un código de fallo genérico, nunca rutas ni nombres de clientes. Ambos inventarios y sus metadatos quedan **dentro del TAR autenticado y cifrado**, no como artefactos públicos. También se cifra `platform-catalog-source.json`, huella SHA-256 del catálogo de roles, ACL, políticas, funciones, constraints, índices y migraciones. Conservar esta fuente permite comparar más adelante contra una restauración operativa de roles.

**Alcance exacto:** esta prueba detecta cambios de identidad, versión, timestamp o tamaño reflejados en `storage.objects` durante la copia. No garantiza atomicidad distribuida frente a modificaciones que no actualicen esos campos, ni preserva por sí misma los roles, sus passwords, la clave raíz de Vault, Auth alojado, JWT, SMTP, Realtime o los secrets Edge. Tampoco constituye ensayo de recuperación integral de Supabase. Hasta completar ese ensayo, el gate externo de promoción mantiene `platformRecoveryVerified=false`. El respaldo anterior a este cambio mantiene su evidencia histórica, pero no debe presentarse como si hubiera superado los nuevos controles.

**Coste:** no requiere un plan de pago ni una nueva instancia de Supabase. El contenedor Postgres de ensayo se ejecuta de manera efímera en GitHub Actions con los mismos permisos y límites del workflow actual.

