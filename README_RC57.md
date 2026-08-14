# IBERFIT M26 — RC57 Android / Wear OS / Bluetooth HR closeout

## Estado

RC57_SOFTWARE_STATUS=PASS
RC57_SOFTWARE_CLOSED=TRUE
RC57_FULL_PHYSICAL_BLE_CLOSED=FALSE
RC57_BLE_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE
RC57_BLE_PHYSICAL_BLOCKER_CLASS=EXTERNAL_HARDWARE_ONLY
RC57_BLE_CODE_FAILURE=FALSE

RC57 queda cerrado a nivel de software. La única validación diferida es el E2E físico de un periférico Bluetooth SIG Heart Rate Service (HRS) real, porque durante este cierre no hay hardware HRS externo disponible. Esa ausencia no se clasifica como defecto de código y no autoriza a simular un PASS físico.

## Base de cierre

RC57_CLOSEOUT_BASE_COMMIT=d497efb89f3b4550e7776566e7191f8657119b63
PHONE_DEBUG_APK_SHA256=40f1f00bf20fb49d73f1fffd55acde94aa1ef9524977ecd9225926052811a553
WEAR_DEBUG_APK_SHA256=76394437ea7345b03a0164ae187f6ff3d23bd6b01bfe2a75428f495303b370bd

## Capacidades cerradas

- Phone + Wear OS shells instalables.
- Wear OS Health Services como provider de frecuencia cardiaca en vivo.
- Data Layer para transporte Wear OS ↔ Android.
- Correlación por executionId y protección frente a callbacks obsoletos.
- Runtime Wear en foreground/background validado físicamente.
- Core de frecuencia cardiaca agnóstico de marca/modelo.
- Provider Bluetooth SIG HRS.
- Descubrimiento HRS iniciado por el usuario.
- Dispositivo Bluetooth preferido persistente y reconexión directa.
- Failover Wear → BLE preferido y recuperación BLE → Wear.
- Foreground service Android `connectedDevice` para continuidad BLE en background.
- Observabilidad debug-only sin BPM, RR, MAC, device id, client id ni execution id.
- Superficie QA debug-only para el E2E físico Bluetooth futuro.

## Evidencia física ya obtenida

WEAR_OS_REAL_SENSOR_E2E=PASS
WEAR_OS_BACKGROUND_E2E=PASS
WEAR_OS_PAUSE_RESUME=PASS
WEAR_OS_STOP_RESTART=PASS
WEAR_OS_EXECUTION_ID_CORRELATION=PASS

La validación Wear OS utilizó sensor real y no depende de supuestos de marca en la arquitectura productiva.

## Validación Bluetooth

BLUETOOTH_HRS_PROTOCOL_TESTS=PASS
BLUETOOTH_HRS_PROVIDER_TESTS=PASS
BLUETOOTH_HRS_DISCOVERY_UX=PASS
BLUETOOTH_HRS_PREFERRED_RUNTIME=PASS
BLUETOOTH_HRS_FAILOVER_HARDENING=PASS
BLUETOOTH_HRS_BACKGROUND_RELIABILITY=PASS
BLUETOOTH_HRS_BACKGROUND_OBSERVABILITY=PASS

BLUETOOTH_HRS_PHYSICAL_DEVICE_AVAILABLE=FALSE
BLUETOOTH_HRS_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE

Cuando exista un periférico HRS físico, la prueba pendiente debe recibir una muestra real del FGS, continuar con app en background, continuar con pantalla apagada, superar pause/resume y demostrar que STOP libera el foreground service. No se permite reemplazar esa evidencia por datos simulados.

## Arquitectura

Regla de RC57: IBERFIT funciona por capacidades y protocolos, no por marcas ni modelos.

Ruta Wear OS:

`Wear OS Health Services → canonical HR provider → Wear Data Layer → Android runtime → web/client`

Ruta Bluetooth:

`Bluetooth SIG HRS → canonical BLE provider → session manager → Android foreground service/runtime → web/client`

El provider y el transporte permanecen desacoplados para permitir proveedores y transportes adicionales en fases posteriores.

## Seguridad de cierre

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE

El cierre RC57 no modifica producción, Supabase ni el canary remoto.

## Próximo bloque

NEXT_ACTION=RC58_SCOPE_DISCOVERY

No se fija alcance funcional de RC58 en este documento porque no existe todavía un contrato RC58 canónico en el repositorio. La siguiente fase debe empezar por discovery de alcance y dependencias antes de introducir cambios de producto.