# IBERFIT M44 · Recuperación de configuración de Edge Functions

**Alcance:** recuperación operativa de las 15 Edge Functions que existían en Supabase PROD al capturar la evidencia del 16 de octubre de 2026. Este documento y sus controles son de **solo lectura**; no exponen ni copian secretos, no generan un despliegue y no recuperan automáticamente Auth ni Vault.

La fuente de cada función, su versión, `verify_jwt`, el SHA del bundle desplegado y la distinción entre ruta canónica e histórica ya se fijaron en `scripts/ops/m44_prod_edge_recovery_sources.json`, mediante el macrobloque PR #960. Esta segunda capa añade el inventario de **nombres de configuración utilizados por ese código**, sin almacenar valores.

## Hallazgos confirmados en el código real

- `iberfit-ai` usa `GEMINI_API_KEY` o `GOOGLE_API_KEY`, `GEMINI_MODEL` opcional, claves publicables y `SUPABASE_URL`. En el despliegue recuperado, `npm:@google/genai` no tiene versión explícita y `npm:@supabase/supabase-js@2` está fijado solo a una versión mayor. Su reconstrucción futura debe resolver y certificar las versiones concretas **sin alterar la instantánea del código desplegado**.
- `iberfit-catalog-admin` contiene `IBERFIT_CANONICAL_CATALOG_URL` con una URL de fallback. La recuperación debe verificar que ese catálogo externo continúe disponible; no basta con recrear su variable.
- `iberfit-web-push-sender-v1` utiliza `IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY`, `IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY` y `IBERFIT_WEB_PUSH_VAPID_SUBJECT`. La recuperación de las suscripciones existentes **no** puede darse por hecha si se regeneran las claves: se exige prueba de compatibilidad de suscripciones o reconsentimiento/reinscripción.
- Las funciones que requieren clave `SUPABASE_SECRET_KEYS` o `SUPABASE_SERVICE_ROLE_KEY` tienen permisos privilegiados: en un proyecto recuperado deben sustituirse por claves del **nuevo** proyecto, en servicios protegidos, nunca en cliente web o GitHub público.
- Las tres funciones retiradas `noop`, `iberfit-one-time-create-juan-v1` e `iberfit-p0-email-delivery-probe-20260911` deben seguir devolviendo `410`. La versión anterior de `iberfit-client-onboarding-v1` es **solo archivo histórico**; no está autorizada para reactivarse.
- `verify_jwt=false` en una función no es automáticamente una vulnerabilidad, pero hace imprescindible certificar su propio control de tokens, firmas y autorizaciones antes de habilitarla.

## Inventario ejecutable de referencias

- `scripts/ops/m44_edge_runtime_config_inventory.json`: nombres utilizados por cada una de las 15 fuentes, clasificados como valores habituales de Supabase, fallback no estándar, integración externa gestionada por el operador y configuración opcional.
- `scripts/ops/m44_edge_runtime_recovery_contract.mjs`: valida las 15 fuentes cotejadas con PR #960, detecta `Deno.env.get(...)` directo, helpers de clave con variables modernas/antiguas y nombres nuevos sin clasificar. Cualquier discrepancia invalida el inventario.
- `tests/m44_edge_runtime_recovery_contract.test.mjs`: regresiones de ausencia, modificación, nueva variable, duplicados, procedencia QA y mezcla de valores privados.
- Ejecutar `node --test tests/m44_edge_runtime_recovery_contract.test.mjs` y `node scripts/ops/m44_edge_runtime_recovery_contract.mjs`. Salen **solo contadores y estados**, nunca valores.

El resultado `referencedNamesCatalogued` **no verifica presencia, validez, vigencia ni recuperabilidad de secretos**. No equivale a una fuente independiente de la configuración real alojada en Supabase.

## Ensayo de recuperación de servicios gestionados pendiente

1. Custodiar **fuera de GitHub** las claves externas que deban conservarse (ej. VAPID y proveedores) y la documentación necesaria para recrear integraciones. No depositar sus valores ni capturas en PRs, Drive compartido o logs.
2. Recuperar el inventario de configuraciones de Auth alojado: site URL, redirect allowlist, proveedor de email/SMTP, plantillas, opciones de sesión/JWT, conexiones OAuth y política de contraseñas. Estas opciones se recuperan de un origen autorizado; ninguna forma de `pg_dump` las certifica por sí sola.
3. Reconstituir nuevas claves de proyecto y volver a enlazar integraciones autorizadas. Rotar/revocar credenciales del proyecto original **solo en una migración de recuperación realmente autorizada**, nunca como parte de un ensayo.
4. Identificar origen y recuperación de Vault, incluida clave raíz; la tabla restaurada no garantiza acceso a sus valores cifrados en un proyecto nuevo.
5. Recuperar **cada** función con su política `verify_jwt`, bundle y módulos probados. Si se utiliza una fuente histórica, comprobar expresamente que no se ha reactivado un endpoint retirado.
6. Certificar casos reales mínimos: login de Cliente, Coach y Admin; sesión y revocación; publicación/lectura según permisos; reportes IRI/evolución separados; email/invitaciones; WebAuthn; Storage; push; y la llamada opcional al proveedor AI. Casos de rechazo y recuperación ante error obligatorios. No usar los datos personales reales en entornos conectados o compartidos de QA.
7. Medir fecha/hora del respaldo, última escritura confirmada y ventana de consistencia entre PostgreSQL y Storage, tiempo total de recuperación (RTO) y pérdida potencial de cambios (RPO). Registrar evidencias no sensibles.
8. No presentar `platformRecoveryVerified=true` ni autorizar las 12 migraciones M44 en PROD hasta que las funciones, Auth, Vault, roles, ACL, Storage e integraciones tengan cobertura conforme al plan de negocio.

La guía actual de Supabase indica los nombres de variables predeterminadas y las diferencias entre claves publicables y secretas: https://supabase.com/docs/guides/functions/secrets. También incluye el procedimiento separado para recuperar proyectos: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.

**Regla de concurrencia:** PR #959 es propietario de roles, ACL, RLS, base de datos y gate de promoción. Este bloque trabaja exclusivamente en *runtime* de Edge y dependencias externas. Ninguno debe sustituir ni bajar el alcance del otro. Tampoco inicia backups adicionales ni realiza ninguna escritura a Supabase.
