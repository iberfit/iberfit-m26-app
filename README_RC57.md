# IBERFIT M26 â€” RC57 Android / Wear OS / Bluetooth HR closeout

## Estado

RC57_SOFTWARE_STATUS=PASS
RC57_SOFTWARE_CLOSED=TRUE
RC57_FULL_PHYSICAL_BLE_CLOSED=FALSE
RC57_BLE_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE
RC57_BLE_PHYSICAL_BLOCKER_CLASS=EXTERNAL_HARDWARE_ONLY
RC57_BLE_CODE_FAILURE=FALSE

RC57 queda cerrado a nivel de software. La Ãºnica validaciÃ³n diferida es el E2E fÃ­sico de un perifÃ©rico Bluetooth SIG Heart Rate Service (HRS) real, porque durante este cierre no hay hardware HRS externo disponible. Esa ausencia no se clasifica como defecto de cÃ³digo y no autoriza a simular un PASS fÃ­sico.

## Base de cierre

RC57_CLOSEOUT_BASE_COMMIT=d497efb89f3b4550e7776566e7191f8657119b63
PHONE_DEBUG_APK_SHA256=40f1f00bf20fb49d73f1fffd55acde94aa1ef9524977ecd9225926052811a553
WEAR_DEBUG_APK_SHA256=76394437ea7345b03a0164ae187f6ff3d23bd6b01bfe2a75428f495303b370bd

## Capacidades cerradas

- Phone + Wear OS shells instalables.
- Wear OS Health Services como provider de frecuencia cardiaca en vivo.
- Data Layer para transporte Wear OS â†” Android.
- CorrelaciÃ³n por executionId y protecciÃ³n frente a callbacks obsoletos.
- Runtime Wear en foreground/background validado fÃ­sicamente.
- Core de frecuencia cardiaca agnÃ³stico de marca/modelo.
- Provider Bluetooth SIG HRS.
- Descubrimiento HRS iniciado por el usuario.
- Dispositivo Bluetooth preferido persistente y reconexiÃ³n directa.
- Failover Wear â†’ BLE preferido y recuperaciÃ³n BLE â†’ Wear.
- Foreground service Android `connectedDevice` para continuidad BLE en background.
- Observabilidad debug-only sin BPM, RR, MAC, device id, client id ni execution id.
- Superficie QA debug-only para el E2E fÃ­sico Bluetooth futuro.

## Evidencia fÃ­sica ya obtenida

WEAR_OS_REAL_SENSOR_E2E=PASS
WEAR_OS_BACKGROUND_E2E=PASS
WEAR_OS_PAUSE_RESUME=PASS
WEAR_OS_STOP_RESTART=PASS
WEAR_OS_EXECUTION_ID_CORRELATION=PASS

La validaciÃ³n Wear OS utilizÃ³ sensor real y no depende de supuestos de marca en la arquitectura productiva.

## ValidaciÃ³n Bluetooth

BLUETOOTH_HRS_PROTOCOL_TESTS=PASS
BLUETOOTH_HRS_PROVIDER_TESTS=PASS
BLUETOOTH_HRS_DISCOVERY_UX=PASS
BLUETOOTH_HRS_PREFERRED_RUNTIME=PASS
BLUETOOTH_HRS_FAILOVER_HARDENING=PASS
BLUETOOTH_HRS_BACKGROUND_RELIABILITY=PASS
BLUETOOTH_HRS_BACKGROUND_OBSERVABILITY=PASS

BLUETOOTH_HRS_PHYSICAL_DEVICE_AVAILABLE=FALSE
BLUETOOTH_HRS_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE

Cuando exista un perifÃ©rico HRS fÃ­sico, la prueba pendiente debe recibir una muestra real del FGS, continuar con app en background, continuar con pantalla apagada, superar pause/resume y demostrar que STOP libera el foreground service. No se permite reemplazar esa evidencia por datos simulados.

## Arquitectura

Regla de RC57: IBERFIT funciona por capacidades y protocolos, no por marcas ni modelos.

Ruta Wear OS:

`Wear OS Health Services â†’ canonical HR provider â†’ Wear Data Layer â†’ Android runtime â†’ web/client`

Ruta Bluetooth:

`Bluetooth SIG HRS â†’ canonical BLE provider â†’ session manager â†’ Android foreground service/runtime â†’ web/client`

El provider y el transporte permanecen desacoplados para permitir proveedores y transportes adicionales en fases posteriores.

## Seguridad de cierre

PRODUCTION_TOUCHED=FALSE
SUPABASE_TOUCHED=FALSE
CANARY_REMOTE_TOUCHED=FALSE

El cierre RC57 no modifica producciÃ³n, Supabase ni el canary remoto.

## PrÃ³ximo bloque

NEXT_ACTION=RC58_SCOPE_DISCOVERY

No se fija alcance funcional de RC58 en este documento porque no existe todavÃ­a un contrato RC58 canÃ³nico en el repositorio. La siguiente fase debe empezar por discovery de alcance y dependencias antes de introducir cambios de producto.