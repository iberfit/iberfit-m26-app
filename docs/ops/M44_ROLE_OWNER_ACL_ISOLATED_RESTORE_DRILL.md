# M44 — Ensayo aislado de recuperación de propietarios, ACL y RLS

## Propósito y límites

Se ha confirmado que el respaldo IBERFIT utiliza `pg_dump -Fc --no-owner --no-acl` y `pg_restore --no-owner --no-acl`. Puede preservar filas, índices y políticas RLS, pero **no garantiza los propietarios de los objetos ni los GRANT y DEFAULT PRIVILEGES**. El archivo global cifrado `global-roles.sql` preserva definiciones de roles sin contraseñas; no restituye por sí mismo permisos de cada tabla.

`scripts/ops/m44_synthetic_acl_restore_drill.sh` y `.github/workflows/m44-role-acl-synthetic-drill.yml` ejecutan una prueba adversarial íntegramente **sintética** en PostgreSQL 17, sin obtener credenciales ni hacer consultas a PROD/QA:

1. Crear exclusivamente roles ficticios `iberfit_m44_fixture_owner` y `iberfit_m44_fixture_reader`, tres bases de datos ficticias y dos filas de ejemplo sin información personal.
2. Registrar en origen propietario de esquema y tabla, `GRANT USAGE` en esquema, `GRANT SELECT` en tabla, `ALTER DEFAULT PRIVILEGES`, RLS activo y política que restringe la lectura a una sola fila.
3. Exportar en formato personalizado con `pg_dump -Fc` y recuperar el primer destino con `pg_restore --no-owner --no-acl`. Deben persistir las dos filas, pero falla el acceso real del rol lector y difieren los permisos.
4. Recuperar el segundo destino con `pg_restore --no-owner` **sin `--no-acl`**, y reconciliar explícitamente propietarios sintéticos. Verificar coincidencia de siete propiedades estructurales y que `SET ROLE` permite leer exactamente una de las dos filas.
5. Fallar de manera cerrada si el restore empobrecido conserva inesperadamente permisos o si el restaurado corregido no coincide con el origen.

Los roles del ensayo se crean en el mismo clúster aislado porque en Supabase real debe gestionarse la existencia de los roles administrados antes de aplicar permisos. **Esta prueba no demuestra recreación de roles en un clúster nuevo ni restaura la copia productiva**, y no valida ningún secreto, login o proveedor de Auth. En particular **no cambia `platformRecoveryVerified=false`** ni el gate de M44 hacia PROD.

## Próxima prueba necesaria con una copia real

Usando exclusivamente el respaldo cifrado autenticado, en un sandbox PostgreSQL 17 **sin red y no compartido**, contrastar las 12 categorías del catálogo source con una reconstrucción de propietarios/ACL y aplicar una comprobación de acceso representativa por rol. Para ello hacen falta fuentes de DDL de propietarios y permisos exactos; el dump `--no-owner --no-acl` y las huellas SHA por categoría no bastan por sí solos para reconstruirlos. Capturarlos y conservarlos dentro del cifrado exigirá actualizar conjuntamente el exportador y el validador externo estricto, preservando compatibilidad histórica.

Los pasos no deben ejecutarse directamente sobre `app.iberfit.cl` o `pjhmrhejsoofmouedavw`. Tampoco hay que eliminar o restablecer las sesiones de Auth de QA sin un cambio separado y autorizado. Véase https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.
