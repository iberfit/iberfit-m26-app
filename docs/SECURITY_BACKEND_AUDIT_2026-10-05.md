# IBERFIT · Security / Data Integrity 360 · auditoría backend

Fecha: 2026-10-05  
Base de código: Canary merge `744fe36112ff1c61e3b61772f3c74943edee08f2`  
Entornos auditados: QA `gjztkdwfmunnzhtvxrsu` y PROD `pjhmrhejsoofmouedavw`

## Principio

La auditoría no convierte advisories genéricos en cambios automáticos. Cada permiso, policy e índice se evalúa contra el flujo real de IBERFIT, el código activo, los grants efectivos y el plan del motor.

Prioridad: mínimo privilegio sin romper Auth, WebAuthn, Command Bus, IRI, notificaciones ni operación del Coach/Admin.

## 1. SECURITY DEFINER ejecutable por authenticated

Inventario efectivo antes de este hardening:

| Entorno | public | private | total |
| --- | ---: | ---: | ---: |
| QA | 53 | 4 | 57 |
| PROD | 55 | 4 | 59 |

Todos los SECURITY DEFINER auditados tienen `search_path` fijado/vacío. No se detectó SQL dinámico en los SECURITY DEFINER de aplicación ejecutables por `authenticated`.

### KEEP · helpers privados de identidad/scope

Se mantienen ejecutables por `authenticated` porque son helpers de políticas/contexto y su resultado se deriva del usuario autenticado:

- `private.iberfit_client_id()`
- `private.iberfit_role()`
- `private.is_assigned_coach(uuid)`

`anon` no tiene `USAGE` sobre el schema `private`; `authenticated` sí, de forma deliberada para estos helpers.

### REVOKE · trigger privado con EXECUTE directo innecesario

`private.iberfit_sync_client_access_activation_v26()` es una función `SECURITY DEFINER RETURNS trigger` instalada como trigger activo en `auth.users` tanto en QA como en PROD.

El trigger no necesita que `PUBLIC`, `anon` o `authenticated` puedan ejecutar la función directamente. La migración:

- conserva la función;
- conserva el trigger;
- conserva al owner;
- revoca solo ejecución directa a roles de aplicación.

### KEEP · RPC públicas deliberadas

Se mantiene `authenticated EXECUTE` en los endpoints canónicos que forman parte de la API real. Se revisaron por familias, no por nombre aislado:

**Contexto / bootstrap / acceso / Command Bus**
- `iberfit_admin_bootstrap_v14`
- `iberfit_application_context_v14`
- `iberfit_authorized_application_roles_v13`
- `iberfit_bootstrap_v26`
- `iberfit_can_access_client_v26`
- `iberfit_canary_enabled_v26`
- `iberfit_client_onboarding_preflight_v12`
- `iberfit_command_preflight_v26`
- `iberfit_current_role_v26`
- `iberfit_environment`
- `iberfit_execute_command_v26`
- `iberfit_admin_execute_v14`
- `iberfit_create_client_draft_v12`
- `iberfit_create_custom_exercise_v1`

**Invitación canónica Admin**
- `iberfit_admin_client_invitation_prepare_v26`
- `iberfit_admin_client_invitation_bind_v26`
- `iberfit_admin_client_invitation_finalize_v26`

**Agenda / comunicación**
- `iberfit_appointment_change_requests_v13`
- `iberfit_request_appointment_change_v13`
- `iberfit_resolve_appointment_change_v13`
- `iberfit_communication_bootstrap_v14`
- `iberfit_communication_execute_v14`

**IRI / documentos privados**
- `iberfit_authorize_iri_report_artifact_v1`
- `iberfit_authorize_iri_report_issue_v1`
- `iberfit_can_manage_iri_external_report_v12`
- `iberfit_can_manage_iri_private_v1`
- `iberfit_can_read_iri_external_report_v12`
- `iberfit_finalize_iri_photo_v1`
- `iberfit_iri_consent_active_v1`
- `iberfit_iri_external_report_preflight_v12`
- `iberfit_iri_photo_report_permission_active_v1`
- `iberfit_iri_report_history_v1`
- `iberfit_prepare_iri_photo_v1`
- `iberfit_record_iri_consent_v1`
- `iberfit_record_iri_photo_report_permission_v1`
- `iberfit_register_iri_external_report_v12`
- `iberfit_save_iri_photogrammetry_analysis_v1`
- `iberfit_save_iri_photogrammetry_analysis_v2`
- `iberfit_withdraw_iri_report_issue_v1`

**Privileged assurance**
- `iberfit_privileged_assurance_context_v65d`
- QA incluye además `iberfit_recover_privileged_device_v1`; PROD no lo expone todavía. Esta diferencia se registra como paridad de feature/promotion, no como permiso que deba revocarse.

**Notificaciones / Web Push**
- `iberfit_notification_preferences_status_v1`
- `iberfit_notification_preferences_upsert_v1`
- `iberfit_web_push_dispatch_authorize_v1`
- `iberfit_web_push_revoke_v1`
- `iberfit_web_push_status_v1`
- `iberfit_web_push_upsert_v1`

**Telemetría**
- `m26_telemetry_can_access_client_v59`
- `m26_telemetry_delete_own_v59`
- `m26_telemetry_import_v59`
- `m26_telemetry_read_page_v59`

**Catálogo público**
- `iberfit_exercise_catalog_public_v1`
- `iberfit_exercise_media_manifest_v1`

Estas dos últimas son las únicas SECURITY DEFINER de aplicación deliberadamente ejecutables también por `anon`, ya auditadas como lectura acotada del catálogo/media públicos.

### REVOKE · RPC de invitación legacy en PROD

PROD conservaba tres RPC antiguas con grant directo `authenticated=X/postgres`:

- `iberfit_client_invitation_begin_v26(uuid,text)`
- `iberfit_client_invitation_fail_v26(uuid,text)`
- `iberfit_client_invitation_finalize_v26(uuid,uuid,text)`

Evidencia de obsolescencia:

1. QA ya no expone esas tres firmas.
2. Ninguna función SQL de QA o PROD las referencia.
3. No se observaron llamadas a sus rutas PostgREST en las últimas 24 h de logs PROD.
4. La Edge Function activa `iberfit-admin-client-invite-v1` tiene el mismo SHA de bundle en QA y PROD y usa exclusivamente:
   - `iberfit_admin_execute_v14`
   - `iberfit_admin_client_invitation_prepare_v26`
   - `iberfit_admin_client_invitation_bind_v26`
   - `iberfit_admin_client_invitation_finalize_v26`

Decisión: retirar únicamente `EXECUTE` a `authenticated` si las funciones legacy existen. No se dropean funciones ni se altera el flujo canónico.

## 2. RLS y Data API

Resultado de inventario sobre tablas `public` en QA y PROD:

- 0 tablas públicas sin RLS.
- Las tablas con RLS y 0 policies tienen también 0 privilegios de tabla para `anon` y `authenticated`.
- Por tanto, esas tablas son deliberadamente inaccesibles por Data API y no representan un bypass de RLS.

Ejemplos: locks operativos, receipts/auditoría Admin, tablas de assurance/WebAuthn, tablas internas de Push, roles de aplicación, batches de telemetría e internas de servicio.

Decisión: no añadir policies ficticias a tablas que deben seguir cerradas. Mantener RLS + ausencia de grants es el comportamiento correcto.

## 3. Índices de foreign keys

Se cruzaron FKs sin índice dedicado con:

- cardinalidad real de PROD;
- `pg_stat_user_tables`;
- índices ya existentes;
- funciones SQL que usan cada columna;
- `EXPLAIN (FORMAT JSON)` de rutas representativas.

Candidatos revisados:

| Tabla / FK | Filas PROD | Evidencia | Decisión |
| --- | ---: | --- | --- |
| `iberfit_privileged_assurance_v1.credential_id` | 67 | La ruta canónica filtra primero por PK `(user_id,session_id)`; el join por credential ocurre sobre la fila resultante. | No añadir índice |
| `iberfit_coach_client_assignments.coach_user_id` | 2 | La consulta canónica usa `organization_id + coach_user_id + status=active`; el planner usa **Index Only Scan** sobre `iberfit_assignment_active_unique`. | Ya cubierto |
| `exercise_media_jobs.created_by` | 19 | El flujo actual usa `created_by` al insertar; la selección de jobs usa índices por exercise/status. | No añadir índice |
| `iberfit_client_lifecycle_events.organization_id` | 3 | Seq scan de coste bajo sobre tabla mínima; sin señal de latencia. | Defer |
| `iberfit_admin_audit_events.organization_id` | 15 | Seq scan + sort de coste bajo; tabla mínima. | Defer |

No se añaden índices por advisory. En tablas de este tamaño, un índice adicional añade coste de escritura, espacio y mantenimiento sin mejora material.

### Umbral de reevaluación

Reabrir un índice cuando exista una combinación de:

- crecimiento material de la tabla (referencia inicial: miles/decenas de miles de filas, no decenas);
- consulta frecuente que filtre/join por el FK;
- `EXPLAIN` que muestre seq scan relevante para un hot path;
- evidencia de latencia/p95 o coste acumulado real.

## 4. Leaked password protection

Permanece fuera de este WIP técnico porque depende del plan/capacidad contratada de Supabase. No se degrada Auth para simular una protección que el plan no ofrece.

Estado: decisión de producto/operación pendiente; no es un cambio de código seguro que deba ejecutarse unilateralmente.

## 5. Cambio preparado

Migración versionada:
`supabase/migrations/20261005164000_security_backend_acl_hardening_v1.sql`

Test:
`tests/m26_security_backend_acl_hardening_v1.test.mjs`

Postcondiciones esperadas tras promoción:

- trigger de activación permanece instalado y habilitado;
- `anon/authenticated` no pueden ejecutar directamente el trigger function;
- QA sigue siendo no-op para las tres RPC legacy inexistentes;
- PROD puede conservar las funciones legacy para rollback/historia, pero `authenticated` deja de ejecutarlas;
- Edge Function de invitación continúa usando exclusivamente RPC Admin canónicas;
- no se modifican datos, RLS, Command Bus ni funciones canónicas.
