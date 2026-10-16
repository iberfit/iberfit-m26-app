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

## Promoción

M44 tiene 12 migraciones presentes en QA y ausentes de PROD en este checkpoint. El workflow `production-promote.yml` no ejecuta esas migraciones: exige el esquema **ya aplicado** antes del frontend. No ejecutar una promoción parcial ni omitir esos gates.

Antes de tocar PROD: copia reciente recuperable, validación de integridad por tablas, auditoría de migraciones, plan de reversión, ensayo de roles/permisos y aprobación técnica del estado exacto SHA. Después: validar el mismo SHA en Canary, permisos por rol, informe IRI inicial **separado** de evolución, PDFs, Storage, Edge, clientes reales y recuperación de errores.

**Política:** ningún permiso amplio, `service_role` en navegador ni exención incondicional del gate para salvar un error de despliegue. No son necesarias suscripciones de pago.
