# IBERFIT Connected 360 — v45, staging exclusivo QA

## Nueva etapa 2026-10-11: escritura explícita V45 + espejo V44 atómico (QA remoto)

**Hardening posterior:** migración QA aditiva `20261011183000_connected360_v45_idempotent_legacy_revision_qa.sql` preserva revisiones V44 cuando V45 recibe un snapshot idéntico: el espejo V44 se omite para filas sin cambios (y se contabilizan como `legacyStale`). No se utiliza el contador `accepted` del V44 heredado como prueba de cambios nuevos. Exigir prueba de replay `revision` constante en QA remota con cuentas sintéticas.


**Migraciones QA aplicadas y verificadas:** `20261011160851_connected360_v45_explicit_native_writer_qa` y `20261011161035_connected360_v45_atomic_legacy_mirror_qa`. Código fuente conservado en `supabase/qa-migrations/20261011162000_connected360_v45_explicit_native_writer_qa.sql` y `supabase/qa-migrations/20261011165500_connected360_v45_atomic_legacy_mirror_qa.sql`, rama `feat/connected360-v45-integrated-macro-20261011`. **NO desplegar estas migraciones a PROD.**

La única RPC nueva `m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb)` es `SECURITY DEFINER SET search_path=''` intencional y acotada: tiene EXECUTE solo para `authenticated`, comprueba `auth.uid()`, `iberfit_client_id()`, assurance de privilegios, validación completa de payload por el preflight V45, grant Health Connect exacto y revocation cursor **bajo el mismo candado transaccional** usado en V44/revoke. El trigger V45 conserva denegación por defecto y exige marcas transaccionales + propietario/cliente/grant coincidentes. Su tabla conserva FORCE RLS y ningún SELECT/INSERT/UPDATE directo para clientes ni políticas permisivas.

Las filas solo pueden representar agregados diarios de Health Connect con consentimiento **explícito**, métricas del grant, zona civil de agregación real y procedencia aún limitada: `source_key=NULL`, `measured_at=NULL`, `source_updated_at=NULL`, `automatic_sync_certified=false`. Una adquisición posterior actualiza un snapshot sin fingir frescura del reloj; fecha/hora idénticas pero métricas diferentes se rechazan. El espejo de compatibilidad V44 se realiza desde el servidor en **la misma transacción PostgreSQL**, nunca con un segundo POST del navegador: fallo de V44 revierte V45. El alias histórico V44 `sourceUpdatedAt=acquiredAt` no valida el timestamp del sensor.

**Comprobación QA remota tras primera migración:** 0 filas V45, RLS ENABLE/FORCE, trigger habilitado, 0 políticas, 0 grants directos a `anon/authenticated`, EXECUTE RPC para `authenticated` pero no `anon`; llamada sin identidad falla con `42501`. La segunda migración confirmó aplicación correcta; **aún falta** la prueba real autenticada con cliente sintético, idempotencia bajo concurrencia y hardware Android. Cambios de aplicación/frontend están solo en la rama de integración, NO en Canary publicado ni PROD. Rollback seguro: `supabase/qa-rollbacks/20261011162000_connected360_v45_explicit_native_writer_qa.rollback.sql` restaura el rejector y conserva todas las filas.

**No certificar como automático**: Android Health Connect requiere hardware E2E real y el puente actual solo recoge datos con aprobación puntual; iOS HealthKit firmado sigue pendiente. `productionAllowed=false`.

**Estado verificado:** migración remota `20261009221320_connected360_v45_closed_provenance_qa` aplicada únicamente en Supabase QA `gjztkdwfmunnzhtvxrsu`. **No incluida en `supabase/migrations/`** para impedir una promoción automática a PROD. SQL reproducido literalmente a partir del historial de migraciones QA, no de un esquema supuesto.

## Alcance concreto
`public.m26_wearable_source_daily_v45`: tabla de datos diarios segregados por origen, por cliente y proveedor, con `source_key` criptográficamente seudonimizado (nullable cuando la identidad del dispositivo es desconocida). `measured_at` y `source_updated_at` permiten NULL; `acquired_at` y `imported_at` son instantes distintos. La migración QA incremental `20261010200000_connected360_v45_aggregation_zone_qa` añade `aggregation_time_zone`, **zona del teléfono/plataforma utilizada para delimitar el día civil**, separada de `source_time_zone` (zona del dispositivo/origen, desconocida si no está acreditada). Es una incorporación nullable, sin backfill ni deducciones artificiales. No hay conversión silenciosa de `record_date` o de la hora de lectura en frescura clínica.

Índices únicos parciales: una agregación diaria por fuente confirmada y, separadamente, como máximo una agregación ambigua por proveedor y fecha cuando `source_key IS NULL`. **No se suman pasos ni minutos entre relojes**. No hay acceso API ni escritura desde Cliente, Coach o Admin; el modelo actual v44 no cambia.

## Seguridad actual
- RLS `ENABLE` y `FORCE`; sin políticas de acceso cliente; `anon/authenticated` revocados; `service_role` explícitamente concedido solo para futuras rutas auditadas.
- Restricciones de calidad, origen, marcas temporales, rango de métricas y `automatic_sync_certified = false`.
- Sin RPC de **escritura** v45 ni autorizaciones automáticas. Existe un preflight QA-only de **solo lectura** que valida la autorización y la procedencia sin habilitar inserciones. Sí existen un trigger QA que **bloquea** INSERT/UPDATE y triggers internos que eliminan v45 atómicamente cuando se solicita borrar los datos de un proveedor o revocar globalmente; nunca permiten importar. Ningún dato de cliente migrado.
- Si futuras rutas usan `service_role`, **deben** comprobar permiso/consentimiento y revocación del lado servidor. Su capacidad de omitir RLS exige revisión separada; ninguna ruta está activa hoy.
- QA tenía cero filas en v44 al aplicar. Tabla nueva verificada también con cero filas. PROD sigue sin esta tabla.
- Rollback guardado en `supabase/qa-rollbacks/`, sin CASCADE. El rollback inicial de esquema requiere tabla vacía; el rollback de `aggregation_time_zone` rechaza la eliminación cuando ya haya cualquier fila con esa procedencia.

## Criterios de desbloqueo para la siguiente fase
1. RPC `SECURITY INVOKER` con propietario ligado a `auth.uid()`, `iberfit_client_id()`, grant UUID actual y revocation cursor, con bloqueo transaccional equivalente al fence v44.
2. Rutina de revocación/erase-all que alcance v44 y v45 en la misma transacción, con pruebas de concurrencia/dispositivo múltiple.
3. Proveedor, identidad de fuente y zona horaria acreditados por el sistema operativo/servicio; no confiar en identificadores de la web ni valores inventados.
4. Evaluador determinista de solapamientos: no mezclar agregados sin conocer procedencia ni declarar datos actualizados solo por una lectura reciente.
5. QA Android físico y pruebas negativas cross-account, consentimiento parcial, desconexión, reintento, offline y dos relojes.
6. Solo tras validación y decisión de lanzamiento, promover SQL controlado a `supabase/migrations/` y producción.

**No confundir esquema de staging con integración de sincronización real.**


## Fase de zona de agregación QA
La migración `20261010200000_connected360_v45_aggregation_zone_qa.sql` vive **solo** en `supabase/qa-migrations/`. Sus controles transaccionales detienen la operación si falta RLS FORCE, si se desactivó el trigger que bloquea ingesta o si aparecen GRANT de tabla para `anon/authenticated`. No crea políticas nuevas, RPC ni rutas de escritura. Android QA envía la zona de la ventana civil separada del origen físico; se conserva como metadato sin reclamar sincronización automática certificada.

**Estado remoto verificado (10/10/2026): APLICADA en QA**, versión Supabase `20261010204028`, nombre `connected360_v45_aggregation_zone_qa` (el fichero fuente usa prefijo `20261010200000`). Se comprobó `information_schema.columns` + constraint de tamaño y formato, **0 filas**, RLS ENABLE+FORCE, 0 policies, ningún GRANT a `anon/authenticated` y trigger de rechazo de escrituras activo. Consulta PROD confirmó ausencia de v45. Esta aplicación es independiente de que el PR esté fusionado, y NO convierte la integración física/automática en certificada.


## Preflight de autorización y procedencia QA (sin ingesta)
Migración `20261010174000_connected360_v45_authorized_preview_guard_qa.sql`, aplicada en Supabase QA como `20261010204723_connected360_v45_authorized_preview_guard_qa`. La función `public.m26_wearable_v45_validate_native_preview_qa_v1(uuid,jsonb)` es `SECURITY INVOKER` con `EXECUTE` únicamente para `authenticated`. Verifica el Cliente actual mediante `auth.uid()` y `iberfit_client_id()`, consentimiento de `health_connect`, grant y revocation cursor, scopes, lote máximo de siete días, procedencia honesta y adquisición reciente.

Solo devuelve que el lote está validado (`persisted:false`, `automatic:false`); **no escribe datos**. En el host Android QA, tras autorización explícita del Cliente, se invoca antes de la importación de compatibilidad v44, sin un nuevo clic. Si falla el preflight, cambia la cuenta, caduca el consentimiento o se revoca, el importador no continúa. Este control no equivale a certificación física ni sustituye la revalidación transaccional obligatoria de la futura escritura v45.

Estado remoto tras aplicar: `m26_wearable_source_daily_v45` con **0 filas**, RLS FORCE, sin INSERT para usuarios autenticados, trigger `m26_wearable_v45_block_unverified_write_qa_v1` activo. QA solamente. La tabla y la nueva RPC no están autorizadas para PROD; el conector de salud nativo de producción permanece cerrado.
