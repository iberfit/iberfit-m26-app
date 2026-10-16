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