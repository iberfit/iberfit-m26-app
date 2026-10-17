# M44 — Recuperación independiente desde Google Drive

## Alcance demostrado

Workflow canónico: .github/workflows/m44-encrypted-disaster-recovery.yml.

El run 38833678711 superó exportación, cifrado, descifrado, restauración local PostgreSQL y comprobación de 126 objetos de Storage. El archivo guardado en Drive se verificó contra el SHA-256 del artefacto de GitHub: e60d46bc0973836449d3e3e6ee16be74a7923b18642fca27689414394fbc1f7a.

El verificador scripts/ops/m44_offsite_archive_guard.py comprueba procedencia y estructura de los bytes recuperados de Drive. Su modo unwrap exige el hash esperado y únicamente un fichero iberfit-prod-recovery.ibf, con cabecera IBFBAK01 y límites de tamaño. Su modo unpack rechaza rutas peligrosas, archivos inesperados, enlaces y duplicaciones tras el descifrado.

La comprobación ZIP/SHA no acredita descifrado por una clave recuperada externamente. La única prueba de autenticidad criptográfica es la validación AES-256-GCM del motor canónico scripts/ops/m44_encrypted_backup_archive.mjs. No crear un segundo cifrador o restaurador paralelo.

## Ensayos independientes efectuados: cuatro generaciones; última copia pendiente

El runbook se originó cuando solo existía un respaldo lógico. Al **16/10/2026** hay evidencia adicional confirmada por el operador Windows, introduciendo su clave en ventana local oculta, sin GitHub/Supabase ni secretos transmitidos al chat:

- Generaciones 1–3: recuperación externa de dump PG17 y bytes de 126 objetos Storage; la tercera agregó declaraciones de roles globales sin contraseñas **preservadas, no aplicadas**.
- Generación 4 (GitHub run 38849763961, Drive privado [identificador reservado al registro privado de custodia]): operador verificó SHA-256, AES-256-GCM, TAR, 126 objetos Storage, existencia de ACL y DEFAULT ACL en TOC y restauración PostgreSQL 17 en contenedor Docker sin red y sin puertos, eliminado al finalizar. Roles y ACL **no aplicados**: --no-owner --no-acl.
- Generación 5 (GitHub run 38888628869, Drive privado [identificador reservado al registro privado de custodia], SHA-256 3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd): tres jobs GitHub SUCCESS, subida privada y descarga posterior desde Drive cotejada con el artefacto GitHub; **pendiente ensayo independiente offline con clave externa de esta última generación**.

La restauración PostgreSQL+Storage fuera de GitHub ya está demostrada con copias anteriores. La recuperación *integral* de Supabase, incluyendo aplicación real de roles/ACL, Auth alojado, JWT, Edge Functions, Vault y secretos, todavía NO lo está. Es incorrecto inferir recuperación de plataforma por presencia de ACL en un archivo. Ninguna de estas pruebas autoriza M44 PROD.

## Procedimiento repetible de prueba externa

1. Descargar los bytes del ZIP desde Drive, sin recuperar el artefacto temporal de GitHub.
2. Recuperar una clave de cifrado conservada de forma independiente y segura fuera de GitHub, sin mostrarla en chat, logs ni código.
3. Validar el SHA-256 del ZIP, su entrada exclusiva y la cabecera con el guard.
4. Descifrar únicamente en un entorno aislado temporal con el módulo canónico M44. Validar tag GCM.
5. Inspeccionar de forma segura el TAR y verificar todos los bytes y hashes mediante m44_storage_backup_bytes.mjs.
6. Restaurar PostgreSQL en una instancia aislada con imagen Supabase compatible (supabase/postgres:17.6.1.147), sin conexiones ni escrituras a PROD ni a QA.
7. Validar esquemas público/Auth/Storage, dependencias, funciones, integridad y componentes gestionados adicionales de Supabase. No imprimir contenido personal.
8. Registrar fecha, digest, alcance, resultados, RTO observado y RPO real, incluida validación del origen externo de la clave.
9. Limpiar los temporales con datos en claro. No subir respaldos, manifiestos privados ni claves al repositorio público.

## Limitaciones relevantes

No hay todavía backup diario automático ni transferencia automática privada acreditada. La retención del artefacto temporal GitHub es de un día y no equivale a almacenamiento duradero. El backup completo no debe clasificarse bajo ninguna persona.

El modo TLS sslmode=require cifra el tráfico pero no verifica plenamente la identidad del servidor: elevar a verify-full con una CA adecuada antes de una automatización permanente. Proteger estrictamente las credenciales con acceso amplio a Storage.

La recuperación aislada de PostgreSQL no demuestra recuperación integral de la configuración gestionada de Auth, Vault, Edge Functions, secretos y servicios externos. M44 tiene 12 migraciones en QA y ninguna confirmada en PROD en el inventario realizado: revisar inmediatamente antes de promoción.

ESTADO: recuperación independiente de PostgreSQL y Storage acreditada hasta la cuarta generación; roles y ACL archivados sin aplicación. Última copia pendiente de ensayo externo. Recuperación integral de plataforma y RTO/RPO **no certificados**; ninguna autorización de despliegue a PROD. Para duraciones observables de transferencia externa, consultar docs/ops/M44_RTO_RPO_MEASUREMENT_EVIDENCE.md.


## Guard reforzado: verificación exhaustiva de bytes de Storage en TAR enriquecido

En el formato enriquecido (con `storage-inventory.json`, `storage-post-inventory.json` y `platform-catalog-source.json`), `scripts/ops/m44_offsite_archive_guard.py unpack` ahora exige **exactamente** los miembros `storage/files/NNNNNN.bin` que figuran en `storage/manifest.json`: ningún fichero omitido o sobrante. Para cada objeto comprueba que el fichero extraído es regular, que su tamaño coincide con el manifiesto y que el SHA-256 de los **bytes reales** coincide con el digest declarado. Conserva el límite individual de 256 MiB del exportador. Todo se verifica sin imprimir rutas privadas, nombres originales, hashes ni datos de clientes.

Solo después de completar todas las validaciones del formato enriquecido —incluida la revisión de `global-roles.sql`, cuando exista— imprime `IBERFIT_OFFSITE_ENRICHED_STORAGE_BYTES_SHA256_VERIFIED`, además del marcador histórico `IBERFIT_OFFSITE_DECRYPTED_ARCHIVE_STRUCTURE_VERIFIED`. En copias históricas sin inventario enriquecido se exige ahora también integridad de Storage según su manifiesto original y se emite el marcador independiente `IBERFIT_OFFSITE_STORAGE_MANIFEST_BYTES_SHA256_VERIFIED` para **ambos formatos**. El marcador más fuerte `IBERFIT_OFFSITE_ENRICHED_STORAGE_BYTES_SHA256_VERIFIED` continúa reservado a copias con inventarios origen/fin y catálogo válidos. El modo legacy sigue admitiéndose sin fingir evidencia de inventarios que no existían. Una inconsistencia obliga a detener la recuperación y a tratar los archivos extraídos como **no certificados**.

Las pruebas sintéticas de CI introducen archivos modificados con igual tamaño, digest falsos, tamaños distintos, archivos faltantes y archivos inesperados, además de comprobar la compatibilidad de formatos anteriores. Tanto para TAR históricos como enriquecidos, el guard rechaza un `database.pgcustom` vacío o sin la cabecera `PGDMP`; **la cabecera por sí sola no garantiza que `pg_restore` pueda reconstruir una base funcional**. El guard se ejecuta **después del descifrado autenticado** del TAR, nunca en sustitución de la autenticación AES-256-GCM. Ni la coincidencia de los bytes de Storage ni un TAR válido acreditan restauración SQL con roles/ACL originales, Auth alojado, Vault, JWT/SMTP, Edge Functions o RTO/RPO. El gate `platformRecoveryVerified=false` sigue vigente.


## Desempaquetado en preparación privada y rechazo sin residuos operativos

El modo `unpack` ya no escribe los ficheros descifrados directamente en la ruta final. Acepta como destino un directorio **vacío o aún inexistente, nunca un enlace simbólico**, extrae el TAR a una carpeta temporal privada `0700` **hermana del destino, en el mismo sistema de archivos**, y conserva los ficheros `0600`. Valida allí el formato de PostgreSQL, la lista de miembros, el inventario y cada SHA-256 de Storage, el catálogo y los roles opcionales. **Solo después de superar todas las comprobaciones** publica el directorio completo con una única operación de renombrado atómico cuando el sistema lo permite: en Linux/POSIX también si el destino es un directorio vacío, y en Windows si el destino no existe. Si el directorio de destino ya existe en Windows, mantiene el mecanismo compatible anterior de publicación por componente con rollback frente a errores gestionados. Los tests confirman que los casos adversariales dejan el destino vacío, y que un destino enlazado simbólicamente no altera los archivos fuera de él.

El modo `unwrap` rechaza también enlaces simbólicos colgantes y nunca elimina un archivo/alias preexistente si falla la apertura exclusiva; solo limpia el fichero de salida que ha conseguido crear. Esta protección evita borrar accidentalmente contenido externo al fallar una verificación.

**Límites:** la eliminación normal de archivos temporales no equivale a borrado criptográfico seguro del soporte físico. Un cierre forzado del proceso, pérdida de energía o un adversario concurrente con acceso al mismo usuario puede requerir limpieza posterior del entorno aislado; por eso el procedimiento debe ejecutarse en almacenamiento efímero cifrado y destruir el contenedor/volumen al finalizar. Estas garantías son de higiene local y no certifican la restauración completa de Supabase ni la integridad del backup sin autenticación AES-GCM.


## Defensa ante archivos excesivos, truncados o publicación incompleta

Antes de escribir un miembro TAR, el guard comprueba su tamaño **declarado en la cabecera**: hasta 256 MiB por fichero de Storage (límite del exportador), hasta 64 MiB para manifiestos/inventarios JSON, hasta 8 MiB para roles y hasta el límite global de 2 GiB para el dump PostgreSQL. La suma completa mantiene el límite de 2 GiB. Además comprueba que el número de bytes realmente copiados de cada miembro coincide exactamente con su tamaño declarado; una copia corta falla antes de publicar componentes.

Las pruebas negativas ejercitan el modo de compatibilidad Windows simulando un error en el segundo componente; el rollback revierte lo publicado. En POSIX simulan un error antes del renombrado atómico, verifican que ningún componente sea visible antes del commit y comprueban que el sistema rechaza sustituir un destino que dejó de estar vacío por una escritura concurrente. La atomicidad del nombre del directorio evita estados parciales **observables después del renombrado** en el mismo sistema de archivos, pero **no garantiza durabilidad tras una pérdida de alimentación (`fsync`)**, borrado seguro de los temporales tras `SIGKILL` ni protección frente a un actor que controle las mismas rutas/permisos. El ensayo independiente debe seguir usando un directorio vacío dentro de un volumen efímero y cifrado; la salida nunca implica que el servicio completo haya sido reconstruido.


## Verificación también en generaciones históricas, sin inventarios adicionales

El productor M44 ya escribía `storage/manifest.json` con `schema`, `project` y `objects`, cada uno con ruta relativa canónica, tamaño y SHA-256. Antes, el guard externo hacía comprobaciones completas de blobs solamente cuando existían tres archivos adicionales del formato enriquecido. Ahora un verificador compartido **comprueba en todos los TAR** la estructura y proyecto del manifiesto, nombres canónicos consecutivos, ausencia de duplicados, conjunto exacto de miembros binarios, límite por objeto, longitud y SHA-256 calculado sobre los bytes restaurados. Si falla, el destino vacío no recibe ningún archivo y no hay marcadores de éxito.

La compatibilidad histórica consiste en admitir un archivo **auténtico y coherente** sin inventarios origen/fin, no en aceptar una copia con un manifiesto inválido o blobs alterados. Las pruebas sintéticas incluyen generadores de TAR legacy con archivos válidos y variantes de bytes modificados, archivos ausentes, adicionales y manifiestos incorrectos. El marcador común `IBERFIT_OFFSITE_STORAGE_MANIFEST_BYTES_SHA256_VERIFIED` solo acredita integridad frente al manifiesto del TAR ya descifrado y autenticado; **no** demuestra consistencia concurrente de un inventario en PROD, recuperación de usuarios/Auth/Vault, permisos ejecutados en Supabase ni RTO/RPO. La autenticidad del TAR sigue dependiendo del descifrado AES-GCM con la clave custodiada fuera de GitHub.


### Publicación de recuperación en un solo renombrado cuando el sistema lo permite

El directorio temporal de extracción se crea junto al destino y solo se publica tras comprobar TAR, manifiesto Storage, SHA-256 de **cada fichero**, dump `PGDMP`, inventarios/catálogo enriquecidos y roles opcionales. Esto elimina el período de visibilidad de componentes parciales en POSIX: el destino vacío existente se reemplaza en una operación del sistema de archivos; si inicialmente no existe, el renombrado único funciona también en Windows. La ruta estándar recomendada en Windows es por tanto un **destino nuevo que todavía no exista**, dentro de un volumen efímero y cifrado. Para directorios ya creados en Windows se mantiene el fallback compatible con rollback, descrito explícitamente como **no atómico ante terminación forzada**. La misma excepción se aplica en cualquier sistema cuando el destino ya existe y es la **raíz de un volumen montado o un dispositivo distinto del directorio padre**: el staging privado debe permanecer dentro del volumen elegido y la raíz no puede reemplazarse por `os.replace`. En ese caso la publicación vuelve al mecanismo por componente con rollback de excepciones, sin prometer atomicidad.

Los tests locales de GitHub Actions verifican publicación íntegra en un directorio inexistente, ausencia de contenido al simular fallo de `os.replace`, protección de contenido del operador ante escritura concurrente y rollback compatible del modo Windows. Todas estas pruebas utilizan contenido ficticio y no equivalen a un ensayo con el fichero cifrado real ni a una certificación de RTO/RPO o Auth alojado.

La prueba sintética de compatibilidad simula un punto de montaje en POSIX y exige que los temporales permanezcan en el directorio montado, que jamás se intente renombrar la raíz del volumen y que los objetos finales se publiquen íntegros. Esta simulación complementa las pruebas de publicación atómica normal; **no sustituye una prueba de montaje real** en el equipo de recuperación.


## Publicación atómica de la entrada ZIP cifrada y vínculo con el inode comprobado

El subcomando `unwrap` del guard ya no escribe la salida `.ibf` directamente en su ruta final. Primero abre el ZIP de Drive como archivo regular, **rechaza enlaces simbólicos** y calcula su SHA-256 con ese mismo descriptor que después utiliza `zipfile.ZipFile`: reemplazar el nombre del ZIP entre ambas fases no desvincula el contenido verificado del contenido que se descomprime. Extrae únicamente la entrada permitida `iberfit-prod-recovery.ibf` a un fichero oculto privado `0600` junto al destino final, comprueba cabecera `IBFBAK01`, longitud declarada y límites, y sincroniza el contenido escrito antes de publicar.

Una vez completo, el fichero cifrado se publica **sin sobrescribir un destino concurrente**: mediante enlace duro atómico `os.link` en POSIX o renombrado `os.rename` en Windows, donde renombrar a un nombre existente falla. El temporal se elimina después de la operación, con éxito o error. Así la ruta `.ibf` final no puede exponer bytes incompletos por interrupción durante la extracción. Se verifica en CI con fallo forzado del enlace, creación concurrente de un destino existente y sustitución del nombre del ZIP después del hash. En sistemas de archivos sin soporte para hardlinks, POSIX falla cerrado y no publica el fichero; no rebaja la protección a una copia no atómica.

La ruta temporal cifrada puede sobrevivir a `SIGKILL` o pérdida eléctrica, porque la limpieza de excepciones solo se ejecuta cuando el proceso puede hacerlo; use un volumen efímero cifrado y compruebe/limpie residuos antes de nuevas operaciones. Esta validación no descifra ni autentica el contenido AES-256-GCM **sin la clave del operador**, no prueba que `pg_restore` funcione ni acredita Auth/Vault/Storage recuperados o RTO/RPO. El marcador `IBERFIT_OFFSITE_DRIVE_CIPHERTEXT_VERIFIED` indica solo verificación del ZIP original y publicación del ciphertext estructuralmente comprobado.
