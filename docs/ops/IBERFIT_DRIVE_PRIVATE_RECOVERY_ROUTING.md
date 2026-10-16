# IBERFIT · Recuperación cifrada en Drive y organización por persona

**Sistema principal único:** M44 \`.github/workflows/m44-encrypted-disaster-recovery.yml\`.
No crear un segundo programador/exportador en paralelo. Su flujo de PostgreSQL + bytes reales de Storage es la fuente canónica mientras pase todas las pruebas y controles de seguridad.

## Estructura real privada ya preparada
\`IBERFIT / 09 - Copias de seguridad\` (carpeta del Drive de IBERFIT, no compartida):
- \`01 - Copia general cifrada IBERFIT\`: para el paquete global \`.ibf\` de M44. Si la transferencia mediante conector utiliza el ZIP de GitHub Actions, el nombre termina en \`.zip\`; solo puede contener ciphertext, y debe comprobarse antes de subirlo.
- \`02 - Copias cifradas por cliente\`: expedientes aislados, SOLO cuando exista una exportación individual certificada. Subcarpeta \`Nombre Apellido · UUID\`; archivos \`Nombre Apellido · fecha UTC · copia-cifrada.enc\`.

**Nunca colocar el backup completo de IBERFIT dentro de una carpeta con nombre de una persona.** Los nombres de cliente provienen únicamente de \`public.clients.id\` y \`public.clients.name\`, y no se escriben en el repositorio público ni en logs.

## Criterio de asignación
- Material compartido, ejercicios, elementos ambiguos y rutas sin relación verificada permanecen en la copia general cifrada.
- Un fichero personal requiere relación unívoca verificada contra la base canónica del cliente. Un UUID dentro del nombre/ruta **no constituye prueba de propiedad**.
- El planificador \`free_storage_recovery_plan.mjs\` conserva conteo y bytes, rechaza duplicados/rutas inseguras y marca como no verificadas la descarga y restauración.
- Antes de transferir, validar permisos de Drive: cuenta propietaria \`iberfit.cl@gmail.com\`, único permiso Owner, no compartido y metadatos verificables. El verificador \`m44_drive_recovery_routing.mjs\` asigna los artefactos globales únicamente a la carpeta global. No sube ni certifica ciphertext.

## Alcance y seguridad
M44 aún no está certificado como copia restaurada y almacenada fuera de Supabase hasta que el workflow de PROD concluya y el artefacto cifrado se traslade al Drive privado con checksum e inventario, y se pueda volver a recuperar con su clave externa.

**Verificaciones pendientes para M44:** \`sslmode=require\` solo cifra la conexión y no autentica el servidor; elevar a \`verify-full\` con CA comprobada antes de habilitar el backup real. Proteger el acceso amplio a Storage (las claves service_role omiten RLS) en entorno aislado, sin exponer secretos. Garantizar custodia de la clave de restauración fuera de GitHub. La restauración en PostgreSQL local no es una prueba de recuperación completa de configuración Supabase Auth, Vault y funciones. No alterar los guardas de producción sin evidencia real.

## Por qué no duplicamos
El PR de preparación de respaldo gratuito detectó durante la certificación que Canary ya incorporó un flujo cifrado completo de M44. Se retiran de la **diferencia final** de este PR los programas redundantes de exportación/cifrado/schedule/drill. Solo se incorporan sus componentes complementarios de Drive/segregación por cliente y sus tests.

**No se han exportado, subido, borrado ni modificado datos personales.** El plan de coste recurrente continúa siendo 0 €, sujeto a cuotas gratuitas y activación controlada.
