# M44 — Auth, Vault y Storage: continuidad y recuperación sin secretos

## Evidencia real de solo lectura (16 de octubre de 2026)

Se consultaron los catálogos de **Supabase PROD** (`pjhmrhejsoofmouedavw`) y **QA** (`gjztkdwfmunnzhtvxrsu`) sin modificar datos, sin extraer correos, contraseñas, identidades ni tokens.

Ambos presentan 27 tablas del esquema Auth, ocho de Storage, una de Vault, 15 roles PostgreSQL no internos y la extensión `supabase_vault` instalada. La **estructura** coincide, no las filas ni la configuración operativa.

| Recuento agregado | PROD | QA |
|---|---:|---:|
| Auth users | 3 | 4 |
| Auth identities | 3 | 4 |
| MFA factors | 0 | 1 |
| WebAuthn credentials | 0 | 0 |
| Vault secrets | 0 | 0 |
| Storage buckets | 7 | 8 |
| Storage objects | 126 | 1.215 |
| Auth session records | 10 | 51.893 |
| Auth refresh token records | 25 | 51.893 |

La ausencia actual de registros en `vault.secrets` **no elimina** los secretos externos: signing keys de JWT, variables de Edge Functions, SMTP, OAuth, claves VAPID o proveedor de IA. El esquema Auth contiene datos de usuario y hashes de contraseña, pero reconstruir el servicio requiere configuración independiente y ensayos de inicio de sesión.

No exigir paridad **PROD ↔ QA**: sus actores y objetivos son diferentes.

### Anomalía de QA: crecimiento de sesiones

Los registros QA de sesiones y refresh tokens pertenecen a tres cuentas de prueba; se generaron 1.267 de cada tipo en las 24 horas previas a la consulta y 235 en la hora previa. Los historiales se extienden desde el 29 de agosto. GitHub registraba 1.113 ejecuciones de Actions el 15/10 y 592 el 16/10; los scripts de QA examinados llaman realmente a `/auth/v1/token?grant_type=password`. Es **compatible con creación de sesiones por tests recurrentes**, pero no prueba que no exista además un problema de autenticación.

**No eliminar, revocar ni vaciar sesiones de QA automáticamente**: primero atribuirlas por ejecución y actor de prueba, medir las llamadas a Auth por CI/job, comprobar revocación, TTL/retención y reducir autenticaciones redundantes preservando los casos negativos. No silenciar el problema con limpieza que rompa pruebas o con alertas que bloqueen todo CI.

## Contrato ejecutable de diagnóstico (sin lectura de filas)

- `scripts/ops/m44_auth_vault_census.sql`: un único SELECT bajo snapshot MVCC; obtiene **exclusivamente recuentos** de 13 tablas Auth, Vault y Storage, una fecha UTC y la versión de esquema.
- `scripts/ops/m44_auth_vault_cardinality_contract.mjs`: admite dos censos obtenidos separadamente (fuente original ligada a backup y PostgreSQL aislado restaurado); detecta cambios de cardinalidad y falla cerrado frente a datos malformados o rutas duplicadas. Nunca muestra valores de recuentos en logs del proceso, correos, identificadores ni secretos.
- `tests/m44_auth_vault_cardinality_contract.test.mjs`: verifica las 13 categorías, rechazo de alteraciones y ausencia de fugas. Comando `node --test tests/m44_auth_vault_cardinality_contract.test.mjs`.

Ejemplo en **entornos autorizados y protegidos**, nunca en un runner público ni como salida en un PR:

```bash
psql -X -A -t -v ON_ERROR_STOP=1 -f scripts/ops/m44_auth_vault_census.sql > censo-privado.json
node scripts/ops/m44_auth_vault_cardinality_contract.mjs censo-fuente-privado.json censo-postgres-aislado-privado.json
```

**Límite crítico:** el censo fuente debe proceder del mismo snapshot MVCC que alimenta `pg_dump`. Si se obtiene después, puede haber escrituras intermedias y el cotejo es solo orientativo. Este PR no altera el workflow del otro hilo y todavía **no certifica dicha vinculación**. Incluso recuentos idénticos permiten filas alteradas: el contrato fija `recordIdentityVerified=false`, `sourceBackupSnapshotProvenanceVerified=false`, `hostedAuthVerified=false`, `vaultKeyRecoveryVerified=false`, `rolePrivilegesVerified=false` y `platformRecoveryVerified=false`.

## Certificación funcional pendiente

Recuperar esquema/datos Auth con versiones compatibles y conservar hashes de contraseña sin exponerlos. Reconstruir y comprobar settings alojados: JWT/signing keys, redirects, proveedores OAuth, plantillas, SMTP, dominios, MFA, recuperación de cuentas y caducidad/revocación de sesiones. No prometer vigencia de antiguos JWT tras crear otro proyecto. Volver a desplegar y probar funciones servidor con claves **del nuevo proyecto**; revisar roles/ACL/RLS, Storage y buckets. Ensayar en destino aislado los flujos Cliente, Coach y Admin (login, refresh, segundo dispositivo, retorno de background, mala conexión, acceso denegado). Verificar WebAuthn/MFA y RP ID si existieran factores registrados.

Los scripts de roles globales del PR #965 deben tratarse como **fuente cifrada para un ensayo aislado**, no como SQL para ejecutar directamente en PROD. Restaurar PostgreSQL+Storage, o comprobar counts, **no constituye DR integral**. Mantener la barrera de migraciones M44/M45 PROD hasta disponer de prueba de plataforma, recuperación offsite reciente y RTO/RPO operacional.

Fuentes: [Supabase Auth user migrations](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects), [Restaurar proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys).

**Sin cambios a PROD ni QA; sin secreto alguno en GitHub.**
