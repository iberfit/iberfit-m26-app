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

## Checkpoint hardening v3 · archivo sin autorización previa

El archivo normalizado exige generación v2 válida **desde la primera escritura**, no solo tras revocación. Las RPC RC44 heredadas conservan compatibilidad con otros proveedores, pero nunca pueden escribir archivos sin UUID vigente. La cola local de archivos antigua sin generación se descarta sin elevarla a nuevos permisos. El usuario puede revisar sin conexión, pero confirmar la importación requiere conexión para autorizar. Se conserva la cola offline que comparta la generación todavía vigente.

El cambio está en `20261008181500_connected360_file_grant_enforcement_v3.sql`, con pruebas regresivas; Apple/Android y otros proveedores permanecen deshabilitados hasta certificación. **Historial QA reconciliado y verificado:** las tres migraciones registradas con las versiones exactas `20261008170000` (fence v1), `20261008173000` (reauthorization v2) y `20261008181500` (enforcement v3). Antes de corregir el ledger, v1 y v2 existían en el esquema sin anotación y la v3 tenía versión automática distinta. Se reparó exclusivamente metadata de migraciones QA tras comprobar tablas, RLS, las cuatro triggers y funciones existentes, sin ejecutar nuevamente las migraciones ni modificar tablas de clientes.

## Certificación adversaria de QA · v3 (08/10/2026)

Pruebas ejecutadas mediante transacciones con `ROLLBACK`, sin persistencia de datos: (1) trigger v3 rechaza `normalized_file` sin generación aun con cursor de revocación 0; (2) sesión QA simulada con rol `authenticated` rechaza importación heredada y activación previa al consentimiento; (3) nueva autorización explícita acepta importación v2; (4) el mismo cliente sin GUC de transacción no puede reutilizar RC44 como bypass; (5) revocación con borrado hace inválida la generación anterior; (6) reconexión explícita emite UUID nuevo y permite importar; (7) dos perfiles QA distintos muestran aislamiento RLS de autorizaciones y rechazan grant de otra cuenta. Resultado: **PASS** de los casos ejecutados. Esto NO equivale a certificación E2E con dos sesiones móviles ni habilita conectores nativos.

## Certificación de proveedores y costes · fuentes oficiales 08/10/2026

No equiparar compatibilidad de archivo con una conexión de API activa. `productionAllowed` permanece `false` salvo `normalized_file`.

| Fuente | Disponible ahora | Requisito real para conectar directamente | Decisión |
|---|---|---|---|
| Archivo normalizado JSON/CSV/TSV | Sí, importación revisada localmente | Cliente autenticado, autorización explícita y confirmación | Mantener `productionAllowed=true` |
| Android Health Connect | No aún | Aplicación Android con permisos declarados y concedidos, integración SDK y validación física. Health Connect disponible desde Android 9 con Play services; integrado en Android 14+. El programa Android Developer Console ofrece distribución limitada gratuita de hasta 20 dispositivos; distribución plena cuesta US$25 una vez | Piloto limitado gratuito **solo tras pruebas reales** |
| Apple HealthKit | No aún | Aplicación iOS real con entitlement y autorización granular; distribución ordinaria mediante Apple Developer Program (US$99/año). La PWA no puede leer directamente HealthKit | No prometer gratuidad de despliegue iOS |
| Strava cloud OAuth | No aún | API requiere suscripción Strava para crear app, gestión de tokens y revisión/limitaciones de capacidad; solicitudes sujetas a cuotas y política de 2026 | Bloquear integración directa mientras requiera suscripción; permitir archivos locales |
| Samsung Health / Wear OS / BLE | No aún | Puentes nativos y prueba específica de dispositivo/sensor, sin equivalencia automática entre proveedores | No habilitar sin pruebas físicas |
| Garmin / Fitbit / Oura | No aún | Comprobar acceso, autorización comercial, licencias y límites actuales de cada API | Bloqueadas hasta acreditación |

Fuentes primarias consultadas:
- Android Health Connect (compatibilidad): https://developer.android.com/health-and-fitness/health-connect/availability
- Android Developer Console (planes de distribución): https://support.google.com/android-developer-console/answer/16604405?hl=en
- Apple HealthKit entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit
- Apple Developer Program: https://developer.apple.com/help/account/membership/program-enrollment
- Strava developer onboarding: https://developers.strava.com/docs/getting-started/
- Strava cuotas, escalado y revisión: https://developers.strava.com/docs/rate-limits/

**Pendiente de producto:** control de pausa/reanudación real y persistente para fuentes de sincronización automática. No presentar un botón de pausa hasta que backend, colas y multidispositivo obedezcan la pausa. El archivo manual no se sincroniza automáticamente sin consentimiento.

## Corte de lotes en vuelo · logout y revocación

`remote-sync.js` revisa el estado de eliminación, cierre de cuenta y revocación **antes de cada lote y entre proveedores**. Si uno de estos eventos se solicita mientras ya hay una petición HTTP enviada, se permite finalizar únicamente ese lote, pero se cancelan los siguientes; el servidor mantiene la barrera transaccional. `clearOwner` elimina la cola del propietario al salir y evita que `refreshState` de esa sesión antigua refresque una cuenta nueva. Las dos carreras están protegidas con pruebas que utilizan 201 registros (dos lotes) y una petición artificialmente retenida.
