# M44 — Comprobación de configuración Auth alojada (solo lectura)

## Objetivo y alcance

La recuperación del 16/10/2026 certificó descifrado AES-256-GCM con clave externa, 126 objetos Storage y `pg_restore` PostgreSQL 17 aislado. La tercera generación preservó `global-roles.sql` sin contraseñas, **sin aplicarlo**. Todo esto **no** recupera la configuración alojada de Auth.

La documentación vigente de Supabase expone **GET** `/v1/projects/{ref}/config/auth` (requiere permiso `auth_config_read`). La respuesta puede contener secretos reales de OAuth, SMTP, proveedores y hooks. **Está prohibido imprimir, guardar en artifacts, copiar a Drive público, pasar al frontend o versionar dicha respuesta.**

Fuente oficial: https://supabase.com/docs/reference/api/v1-get-auth-service-config

## Cambio introducido

- `scripts/ops/m44_hosted_auth_config_readonly.mjs`: únicamente consulta el proyecto PROD exacto `pjhmrhejsoofmouedavw` por GET, con timeout y límite de lectura de 1 MiB, sin seguir redirecciones. El token de gestión entra exclusivamente por entorno protegido, nunca como argumento CLI.
- Verifica tipos y márgenes de configuración de inicio de sesión por email, confirmación, TTL JWT, URL segura con hostname IBERFIT y flags de proveedores. No publica ninguna URL, plantilla de correo, correo, nombre de proveedor, JWT, contraseña, credencial, valor de secreto ni cuerpo completo de errores HTTP.
- `tests/m44_hosted_auth_config_readonly.test.mjs`: ejecución sintética con secretos falsos centinela, comparaciones negativas y respuesta remota simulada. No utiliza datos reales.
- `.github/workflows/m44-hosted-auth-config-readonly.yml`: `pull_request` ejecuta **solo tests herméticos sin secretos**. Tras merge a Canary, el job de lectura real utiliza el entorno protegido `m26-canary-readonly` existente, exclusivamente GET y solamente salida reducida a contadores/estados. Puede ejecutarse por `workflow_dispatch` autorizado.

Este módulo es independiente de PR #969, que se ocupa de restauración sintética de propietarios/ACL, y PR #955, que estudia la convergencia de SHA. Tampoco modifica el flujo de aprobación/emisión de PDF M44 ni las 12 migraciones.

## Criterios de seguridad y recuperación

La salida `M44_HOSTED_AUTH_CONFIG_METADATA_OK` acredita únicamente que se pudieron leer ciertos parámetros de Auth desde la API autorizada en ese momento. **No** demuestra que las credenciales puedan recuperarse, que SMTP envíe mensajes o que una configuración segura haya quedado aplicada en un destino nuevo.

La comprobación deliberadamente devuelve las garantías:
- `authUserRestorationVerified=false`
- `jwtSigningKeyRestorationVerified=false`
- `oauthSecretsRestorationVerified=false`
- `smtpDeliveryVerified=false`
- `redirectRecoveryVerified=false`
- `credentialContinuityVerified=false`
- `platformRecoveryVerified=false`

**El paso final exige un destino realmente aislado y autorizado** que pruebe restauración de usuarios y login con hashes originales, emisión de JWT firmados por la **nueva configuración**, recuperación de cuenta, e-mail, MFA, permisos Cliente/Coach/Admin, Edge Functions y callbacks de proveedores. Sesiones JWT antiguas pueden dejar de valer si cambia la clave: planear reautenticación sin prometer continuidad mágica. Comprobar cancelación/revocación de sesiones, redirecciones y la capacidad de operar sin loops ni congelamientos. La extracción de datos personales sólo puede ocurrir dentro del backup cifrado y en entornos privados autorizados.

Para una reconstrucción propia, Supabase documenta que PostgreSQL contiene tablas `auth.users` pero **no** instala automáticamente JWT, proveedores OAuth, SMTP, Edge Functions ni DNS: https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Estado de liberación

**No habilitar M44 PROD** por pasar este job. Se deben mantener `platformRecoveryVerified=false`, copia reciente verificada, restauración con ACL y roles aplicada en laboratorio, E2E auténtico PDF evolucionario con WebAuthn/Cliente y QA móvil, más RTO/RPO formal. El job es estrictamente read-only y no sustituye la certificación funcional.
