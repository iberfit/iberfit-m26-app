# IBERFIT Connected 360 — v45, staging exclusivo QA

**Estado verificado:** migración remota `20261009221320_connected360_v45_closed_provenance_qa` aplicada únicamente en Supabase QA `gjztkdwfmunnzhtvxrsu`. **No incluida en `supabase/migrations/`** para impedir una promoción automática a PROD. SQL reproducido literalmente a partir del historial de migraciones QA, no de un esquema supuesto.

## Alcance concreto
`public.m26_wearable_source_daily_v45`: tabla de datos diarios segregados por origen, por cliente y proveedor, con `source_key` criptográficamente seudonimizado (nullable cuando la identidad del dispositivo es desconocida). `measured_at` y `source_updated_at` permiten NULL; `acquired_at` y `imported_at` son instantes distintos. No hay conversión silenciosa de `record_date` o de la hora de lectura en frescura clínica.

Índices únicos parciales: una agregación diaria por fuente confirmada y, separadamente, como máximo una agregación ambigua por proveedor y fecha cuando `source_key IS NULL`. **No se suman pasos ni minutos entre relojes**. No hay acceso API ni escritura desde Cliente, Coach o Admin; el modelo actual v44 no cambia.

## Seguridad actual
- RLS `ENABLE` y `FORCE`; sin políticas de acceso cliente; `anon/authenticated` revocados; `service_role` explícitamente concedido solo para futuras rutas auditadas.
- Restricciones de calidad, origen, marcas temporales, rango de métricas y `automatic_sync_certified = false`.
- Sin RPC v45, sin jobs, triggers ni autorizaciones automáticas. Ningún dato de cliente migrado.
- Si futuras rutas usan `service_role`, **deben** comprobar permiso/consentimiento y revocación del lado servidor. Su capacidad de omitir RLS exige revisión separada; ninguna ruta está activa hoy.
- QA tenía cero filas en v44 al aplicar. Tabla nueva verificada también con cero filas. PROD sigue sin esta tabla.
- Rollback guardado en `supabase/qa-rollbacks/`, ejecutable manualmente **solo si tabla vacía**, sin CASCADE.

## Criterios de desbloqueo para la siguiente fase
1. RPC `SECURITY INVOKER` con propietario ligado a `auth.uid()`, `iberfit_client_id()`, grant UUID actual y revocation cursor, con bloqueo transaccional equivalente al fence v44.
2. Rutina de revocación/erase-all que alcance v44 y v45 en la misma transacción, con pruebas de concurrencia/dispositivo múltiple.
3. Proveedor, identidad de fuente y zona horaria acreditados por el sistema operativo/servicio; no confiar en identificadores de la web ni valores inventados.
4. Evaluador determinista de solapamientos: no mezclar agregados sin conocer procedencia ni declarar datos actualizados solo por una lectura reciente.
5. QA Android físico y pruebas negativas cross-account, consentimiento parcial, desconexión, reintento, offline y dos relojes.
6. Solo tras validación y decisión de lanzamiento, promover SQL controlado a `supabase/migrations/` y producción.

**No confundir esquema de staging con integración de sincronización real.**
