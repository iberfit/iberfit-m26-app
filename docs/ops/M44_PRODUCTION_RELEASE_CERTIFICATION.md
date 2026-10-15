# IBERFIT M44 · Certificación de salida a producción

**Estado:** preparado, no publicado. El IRI inicial y los informes longitudinales de seguimiento son dominios diferentes. No mezclar evaluaciones, artefactos, Storage ni consentimientos.

## Identidades y ambientes
- Código M44 en Canary: merge de PR #950, `be2896db55c4ee2f03f0c26a9a168a866e677608`.
- Canary live exacto: GitHub Actions `38814106187`, intento 2, SHA exacto, desktop/mobile smoke correctos.
- QA Supabase: `gjztkdwfmunnzhtvxrsu`. Producción: `pjhmrhejsoofmouedavw`.
- Producción no contiene todavía funciones M44, ledger `iberfit_evolution_report_issuances_v1`, bucket `iberfit-evolution-issued-reports` ni Edge de evolución. NO confundir frontend construido con backend listo.

## Orden de migraciones por dependencia
La aplicación debe permanecer sobre la versión de producción vigente mientras se valida el backend. Antes de cualquier DDL, validar schema, roles, grants, conteos e invariantes de consentimiento y generar checkpoint restaurable según política del proyecto. Nunca limpiar ni transformar informes reales silenciosamente.

1. `20261015141000_m44_report_canonical_draft_bootstrap_v1.sql`
2. `20261015141500_m44_public_table_truncate_acl_guard.sql`
3. `20261015142000_m44_report_client_safe_publication_v1.sql`
4. `20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql`
5. `20261015143000_m44_report_command_only_write_boundary_v1.sql`
6. `20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql`
7. `20261015145000_m44_report_issued_pdf_history_v1.sql`
8. `20261015145500_m44_pdf_immutable_ledger_write_guard_v1.sql`
9. `20261015150000_m44_pdf_withdraw_domain_audit_v1.sql`
10. `20261015150500_m44_service_ledger_read_acl_v1.sql`
11. `20261015151000_m44_privileged_assurance_fence_v1.sql`
12. `20261015214000_m44_pdf_privileged_invoker_guard_v1.sql`

Revisar migraciones condicionales antes de aplicar. `m44_bootstrap_private_reports_http_fence_v1` exige la huella MD5 de `iberfit_bootstrap_v26()` `c1c623c3724d650dae8e96656490bff9` o `aedea9df3d4986496626e10318628c41`. En revisión QA mostraba la segunda y PROD la primera, ambas expresamente admitidas. Si la huella cambia, detener; nunca sortear el guard.

## Respaldo y recuperabilidad ANTES de la primera migración de producción
- Ejecutar el workflow `IBERFIT M44 PROD Backup Inventory Readiness` (sin escrituras) contra el proyecto PROD exacto. Su comprobación consulta exclusivamente `GET /v1/projects/{ref}/database/backups`, exige al menos un registro `COMPLETED` reciente (≤48 horas) y nunca descarga datos de clientes.
- Este inventario NO demuestra por sí solo que un backup pueda restaurarse. Antes de cualquier DDL PROD, verificar de forma independiente una restauración recuperable o un volcado lógico seguro, íntegro y restaurable. No guardar dumps con datos personales en logs ni artefactos sin cifrar.
- Si Supabase devuelve `403`, no hay backups `COMPLETED` recientes, el proyecto es Free sin respaldo utilizable o falta evidencia de restauración, **BLOQUEAR** migraciones M44 y promoción. No asumir que el plan Free tenga backups restituibles.
- La verificación de inventario se ejecuta otra vez en `production-promote.yml` *antes* de todos los gates de esquema, Edge y frontend. Si falla, producción conserva su versión anterior.
- Ref oficial: https://supabase.com/docs/guides/platform/backups . No confundir restaurar Cloudflare Pages con restaurar Postgres, Storage, credenciales o Edge Functions.

## Coherencia de controles y privacidad de evidencia
- `prod-data-safety-gate.yml` es un control de revisión de cambios, no prueba por sí solo de restauración integral. Un `LOGICAL_SCHEMA_SNAPSHOT` del plan Free sirve para auditar DDL, restricciones y hash del esquema; **no contiene filas, autenticación, objetos ni permisos externos recuperables**. Se etiqueta `SCHEMA_ONLY_NOT_A_BACKUP` y `productionMigrationApproved:false`; si un PR introduce migraciones y falta backup completo, se bloquea.
- Las evidencias compartidas en GitHub Actions deben limitarse a resúmenes de estado y hashes; no publicar el JSON de catálogos (incluye cuerpos de funciones, posibles literales internos) ni backups completos de usuarios.
- Los controles de backups M44 y Data Safety usan el mismo evaluador de respaldo gestionado, con comprobación de WAL-G/PITR, base física reciente y tolerancia de antigüedad estricta; los resúmenes no certifican por sí solos una restauración probada.
- Verificar la disponibilidad de backups de forma independiente del envío de frontend. **Producción sin respaldo integral restaurable = no aplicar las doce migraciones M44.**

## Certificación obligatoria antes del frontend
- `node scripts/ops/verify_m44_prod_schema.mjs` usa **solo** el endpoint Management **read-only** y el target exclusivo de PROD. Sus 20 predicados cubren: tablas y RLS; denegación de escritura directa; bucket privado; RPC autentificadas y acceso anónimo denegado; finalización por `service_role` exclusivamente; comprobación moderna del rol; protección append-only y garantías de sesión privilegiada.
- `supabase/config.toml`: `[functions.iberfit-evolution-report-emission-v1]` exige `verify_jwt = true`.
- `.github/workflows/production-promote.yml`: primero esquema, después Edge PDF, test HTTP sin JWT=401 y finalmente despliegue del frontend exacto, smoke escritorio/móvil, auditoría y rollback Cloudflare ante fallo. No emitir PDFs sintéticos en PROD.
- Las fuentes M44 deben proceder del SHA exacto firmado del release. Ninguna clave privada debe entrar en el bundle del navegador.
- Un 401 de la función Edge no sustituye el test de autorización de rol/RLS. Estos se prueban en QA con WebAuthn Coach real, dos clientes aislados, SHA-256 de los bytes, retry idempotente, historial, retirada y denegación posterior: [run #38809165408 intento 3](https://github.com/iberfit/iberfit-m26-app/actions/runs/38809165408), **SUCCESS**.

## Criterio de fallo seguro y reversibilidad
- Si faltan tablas/roles/functions, no desplegar frontend. No debilitar RLS ni cambiar el guard a `current_user` dentro de `SECURITY DEFINER`.
- Si falla Edge o verificación de su autorización, no promover; corregir y volver a ejecutar los gates. Registrar versiones de funciones antes y después; el rollback del frontend **no** restaura por sí mismo las migraciones ni versiones de Edge.
- La evidencia de un PDF retirado debe quedar en el ledger inmutable. No borrar bytes históricos ni imágenes/datos personales automáticamente por error de prueba. Revisar el artefacto huérfano QA por su propio procedimiento de reconciliación.
- Si falla una migración sobre PROD, bloquear release y evaluar recuperación/restauración específica de DB, no aplicar parches de relajación de autorización.
- Separar pruebas que pueden escribir **solo en QA sintética** de pruebas **read-only** en producción; no usar clientes reales como fixtures.

## Evidencia que debe adjuntarse para declarar M44 terminado
Migraciones PROD y asesores; resultado de 20/20 predicados; lista Edge con JWT verificado; CI/QA/Canary actual SHA exacto; release manifest; certificación HTTP sin token; navegador móvil/escritorio y runtime read-only; rollback documentado; pruebas de privacidad Cliente/Coach/Admin; producción final vista en `app.iberfit.cl` con SHA y auditoría post-release sin degradación de sesiones.
