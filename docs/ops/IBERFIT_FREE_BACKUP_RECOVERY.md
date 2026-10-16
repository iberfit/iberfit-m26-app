# IBERFIT · Recuperación gratuita, sin falsas garantías

Estado: FUNDAMENTO TÉCNICO PREPARADO; NO ESTÁ OPERATIVO NI CERTIFICADO EN PRODUCCIÓN.

## Por qué
El proyecto Supabase PROD está en el plan Free y carece de backups diarios gestionados. El repositorio GitHub de IBERFIT es PÚBLICO. No almacenar copias sin cifrar en GitHub, nunca.

## Protocolo aprobado sin planes pagados
1. Conexión de solo lectura operativa a PROD por Session Pooler (puerto 5432, TLS); secreto fuera del código.
2. Copia lógica de TODOS los esquemas de PostgreSQL, incluida información de usuarios Auth, clientes y entrenamientos. Comprobar la presencia de tablas Auth y Storage en el archivo.
3. Cifrar antes de exportar mediante AES-256-GCM y RSA-OAEP-3072+. La clave privada queda fuera de GitHub, GitHub Actions, Google Drive y de cualquier repositorio.
4. Una copia cifrada temporal en artefactos de GitHub con cuota limitada y copia secundaria cifrada independiente en un almacenamiento gratuito con espacio y acceso verificados.
5. Verificar restauración REAL en Postgres efímero, nunca en QA compartido. Comprobar integridad referencial, permisos y recuentos de entidades críticas. Evaluar por separado todos los bytes de Supabase Storage (fotos y documentos), que NO están en pg_dump.
6. Sin copia reciente, acceso a la clave privada y restauración confirmada: detener migraciones y promoción PROD. No sustituir por catálogos de esquema o pg_restore --list.

## Límite del primer bloque
El código de cifrado y sus pruebas están preparados. No existen todavía credenciales de conexión de backup ni custodia de la clave privada. No se ha exportado dato real ni certificado restore. El validador marca expresamente fullRestoreVerified=false, storageObjectBytesIncluded=false, productionMigrationApproved=false.

## Operación futura
Para activar después de pruebas: credencial de acceso PROD exclusiva para copias como secret protegido; clave pública solamente en configuración de CI; programa programado desde la rama GitHub predeterminada (actualmente no coincide con canary/rc74-4); retención de máximo 3 días y máximo 24 MiB por archivo, con alerta/bloqueo si falla la cuota. El origen será siempre la referencia exacta de producción. Revisión de capacidad antes de automatizar.

Nunca activar la programación a ciegas: en GitHub Free los artefactos y minutos tienen cuota, y el repositorio público no protege contra descargas de artefactos; la protección real depende del cifrado y custodia privada.


## Organización privada en Google Drive · nombre de cada persona
Ya existen, bajo `IBERFIT / 09 - Copias de seguridad`, dos directorios privados propiedad de IBERFIT:
- `01 - Copia general cifrada IBERFIT` para el respaldo de la base completa y su manifiesto.
- `02 - Copias cifradas por cliente` para respaldos **individuales comprobados**, cada uno dentro de una carpeta `Nombre Apellido · UUID del cliente`. El UUID evita fusionar por error dos personas con nombres idénticos.
Cada paquete individual se denomina `Nombre Apellido · fecha-UTC · copia-cifrada.enc` y mantiene el cifrado de contenido.

La identidad debe proceder de `public.clients.id` y `public.clients.name`, no de datos escritos a mano ni de una coincidencia por nombre. La clave privada está fuera de Google Drive. No se publican enlaces ni se comparte ninguna carpeta.

**Aún no existen respaldos individuales en Drive.** Estas carpetas son exclusivamente una estructura ya creada. Un respaldo general no puede etiquetarse como si perteneciera a una sola persona: debe comprobarse `ONE_CLIENT`, su ID y el contenido segregado. Los informes IRI y de evolución conservarán sus carpetas funcionales, distintas de los archivos técnicos cifrados.

No almacenar identificadores y nombres de clientes reales en el repositorio público o sus logs. Comprobar permisos e integridad antes de cualquier subida.
