# IBERFIT Connected 360 · macro-WIP de integración segura

**Estado:** desarrollo en PR #808, sin fusión ni anuncio de compatibilidad nativa en producción.
**Referencia:** issue #79 y especificación aprobada para conexión opcional desde el primer acceso.
**Base:** rama protegida Canary; mantener un solo macro-WIP hasta certificación.

## Contrato de producto

Cliente: primera entrada → bienvenida contextual → invitación opcional → importar o solicitar permisos de fuente **certificada** → verificar datos → consultar seguimiento y Ajustes. Rechazar nunca bloquea entrada ni produce avisos reiterados. IRI inicial y evolución permanecen independientes.

Coach: contexto de actividad confirmado para orientar decisiones profesionales; jamás cambios autónomos de carga.
Admin: salud operativa de conexiones sin datos personales de salud innecesarios.

## Estado técnico contrastado

- PWA: importación local real JSON/CSV/TSV mediante normalización, vista previa y confirmación; la selección de plataforma nombra el origen del archivo y **no equivale a una conexión**.
- Apple HealthKit: paquete Swift existente, sin app iOS distribuida, permisos ni prueba física de ingestión completa.
- Android Health Connect: módulos Kotlin existentes, sin APK público ni certificación de dispositivo físico.
- Wear OS / BLE: puentes internos en desarrollo, no listos para prometer enlace universal.
- OAuth cloud: Garmin, Fitbit, Strava y Oura sin validación de credenciales, permisos y límites contractuales para activación PROD.
- Política viva: `normalized_file` habilitado; los demás proveedores siguen `productionAllowed=false`. Las acciones nativas detectadas deben comprobar también esta política.
- RLS y privacidad: backend RC44 verifica usuario autenticado y cliente sobre RPCs; cero filas en las tablas wearable de QA y PROD al inspeccionar el esquema (08/10/2026, solo lectura).

## Incidencia estructural de revocación (bloqueante antes de conectar fuentes)

Inspección de las definiciones reales de Supabase QA y PROD, sin ejecutarlas:

1. `m26_wearable_revoke_v44` establece `status='revoked'`, deshabilita sync y puede borrar resúmenes, pero no coordina todo el trabajo anterior o simultáneo entre dispositivos.
2. `m26_wearable_import_v44` valida autenticación y propietario y realiza upsert por fuente/fecha, pero **no comprueba el estado revocado/pausado** al importar.
3. `m26_wearable_connection_upsert_v44` puede actualizar una conexión revocada nuevamente a `active` y registrar nuevo `grant` sin acreditar una nueva ceremonia explícita.
4. `m26_wearable_delete_all_v44` elimina conexiones y resúmenes; una cola concurrente puede volver a crear registros si no existe un tombstone/epoch persistente.

**Mitigación local en este WIP:** serialización por instancia de importación / revocación / eliminación; bloqueo inmediato de tareas de fuentes revocadas, sin reintentos ciegos; el último comando remoto gana dentro de esa instancia. Esto **no** certifica aún seguridad multipestaña/multidispositivo.

**Diseño servidor pendiente de certificación QA, antes de cualquier activación nativa:**

- Consentimiento por propietario + cliente + proveedor, versión monotónica / epoch opaco emitido por servidor tras reautorización explícita.
- Todas las importaciones y cambios de conexión validan estado autorizado, scopes, epoch actual y propietario **en la transacción del servidor**, con protección ante concurrencia con revocación.
- Revocación y eliminación marcan tombstone durable y rotan epoch, anulan cargas antiguas pendientes y no modifican el historial de consentimiento.
- Reautorizar requiere operación explícita separada con nuevas garantías, no un `upsert status=active` enviado por un sincronizador antiguo.
- `normalized_file` necesita autorización manual equivalente al pulsar «Confirmar importación», compatible con archivos revisados y primer día.
- Ruta de migración aditiva, sin pérdida de datos: preparar rollback, revisar RLS/GRANT, CAS/revisiones y pruebas adversarias en QA; desplegar producción solo tras resultados reproducibles y lectura de migraciones.
- Probar orden A importa → B revoca → A reintenta; revocación mientras batch está en vuelo; A borra todos los datos → B importa; múltiples dispositivos; cuenta ajena; offline → online; reautorización explícita. No aceptar `accepted>0` después de una revocación confirmada.

## Umbrales de aceptación del macrobloque

- UX: primer día y Ajustes navegables en iPhone/Android/tablet/desktop, sin overlay bloqueante, focus y safe-area correctos.
- Seguridad: permisos mínimos específicos, revocar impide futuras importaciones de cualquier dispositivo, borrado verificado, no exponer tokens ni datos en logs.
- Datos: fuente, unidad, método VFC, fecha, calidad, estado, deduplicación y nulos auténticos.
- Sincronización: primer permiso, apertura, retorno de background, red recuperada, manual y estados loading/success/empty/error/retry; batería y backoff.
- Hardware: solo declarar fuente conectable tras prueba real en app nativa o cloud autorizada; no basta un adaptador simulado.
- QA: unitarias, integración, seguridad/RLS, E2E autenticado, accesibilidad, canary exacto, control de regresiones y rollback.
- Costes: mantener proveedores gratuitos u opciones abiertas, documentando requisitos de cuenta/despliegue para apps nativas.

No fusionar esta PR como Connected 360 terminado mientras persista el riesgo servidor de revocación o la conexión real no esté certificada.

## Checkpoint v2 · reautorización y generaciones (QA · 08/10/2026)

Implementado en PR #808, no en producción. Migración aditiva: `20261008173000_connected360_explicit_reauthorization_v2.sql`, instalada solo en Supabase QA.

- Ledger de revocación monotónico, autorización vigente por cliente/fuente y generación UUID, ambas tablas con RLS.
- Tres RPC autenticadas: estado, reautorización explícita CAS e importación con generación. Solo `normalized_file` habilitado.
- La ruta v44 conserva compatibilidad, pero no puede cruzar un tombstone existente. El lote v2 necesita grantId vigente y métricas incluidas en scopes consentidos.
- La importación en la interfaz nace del botón explícito de confirmación del archivo. El sync de fondo no puede emitir autorizaciones.
- La cola antigua no hereda autorizaciones nuevas. Los rechazos no transitorios quedan fuera del ciclo de reintentos; revocación elimina la cola asociada.
- UI del cliente: desconectar conservando historial o desconectar borrando historial, con confirmación.

### QA transaccional autenticado (ROLLBACK)

Resultado PASS en QA, sin persistir registros de prueba: importar (accepted=1), revocar, denegar grant viejo, denegar CAS desfasado, reautorizar con nuevo UUID, importar (rejected=0), denegar UUID anterior y denegar después de delete-all. Cuatro rechazos esperados confirmados.

Se detectó y respetó la constraint existente `m26_wearable_consents_v44_policy_version_check`: la auditoría continúa usando `v44-zero-cost` y guarda la versión de permiso v2 por separado; ningún CHECK fue modificado.

### Antes del merge / PROD

- Aprobar CI real al SHA exacto, seguridad, QA de escritura, navegación Cliente/Coach/Admin y E2E móvil.
- Certificar revocación entre dispositivos reales, recuperación tras mala red, cambios de sesión y autorizaciones concurrentes.
- No prometer HealthKit/Health Connect, BLE o OAuth cloud hasta certificación real y análisis de costes.
- Verificar rollback y diff QA/PROD de ambas migraciones; mantener PR #808 en borrador y PROD intacta hasta completar.
