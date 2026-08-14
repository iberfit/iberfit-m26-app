# RC56 · Validación física Android Wear OS

Estado: **PASS**

Base validada: `9d93330d23a6029bc742676bd5e5463f1e8360a3` (`feature/rc56-1-windows-native-compile`).

## Fuentes exactas validadas

- `native/android/wear/IBERFITWearHealthServicesBridge.kt`
  - Git blob normalizado: `eaa4c1d2945d19d505351352672e1a3b54cf6a4c`
- `native/android/runtime/IBERFITWearDataLayerRuntime.kt`
  - Git blob normalizado: `5c5ac124bc65253cdc62e4c66649e20fbc3288fa`

## RC56.2 · Health Services en hardware real

Dispositivo: Samsung Galaxy Watch 4, modelo `SM-R860`, Android 16, SDK 36.

Resultado observado:

- permiso API 36 `android.permission.health.READ_HEART_RATE`: concedido;
- `HEART_RATE_CAPABILITY=TRUE`;
- `ExerciseClient`: PASS;
- ejercicio seleccionado: `STRENGTH_TRAINING`;
- proveedor: `wear_os_health_services`;
- muestra física: **91 bpm**;
- `RC56_2_GALAXY_WATCH4_REAL_SENSOR=PASS`;
- `RC56_2_WEAR_HEALTH_SERVICES=PASS`;
- cierre de ejercicio y callback: PASS.

## RC56.3 · DataLayer end-to-end en hardware real

Dispositivos:

- Wear: Galaxy Watch4 (SLFR), `SM-R860`;
- Android companion: Galaxy J6, `SM-J600G`.

Ejecución correlacionada: `rc563-1786490011551`.

Cadena validada:

1. Galaxy J6 → comando `start` por DataLayer → Galaxy Watch 4.
2. Galaxy Watch 4 → Health Services → sensor óptico real.
3. Muestra real **87 bpm**, proveedor `wear_os_health_services`.
4. Galaxy Watch 4 → DataLayer → Galaxy J6.
5. Galaxy J6 recibió la misma muestra de **87 bpm**.
6. Galaxy J6 → comando `stop` → Galaxy Watch 4.
7. Galaxy Watch 4 recibió `stop`, finalizó el ejercicio y terminó en `TERMINAL=PASS`.

Marcadores finales observados:

- `RC56_3_EXECUTION_CORRELATION=PASS`
- `RC56_3_PHONE_TO_WEAR_START_COMMAND=PASS`
- `RC56_3_WATCH_REAL_HEART_RATE=PASS`
- `RC56_3_WEAR_TO_PHONE_DATALAYER=PASS`
- `RC56_3_PHONE_RECEIVED_REAL_SAMPLE=PASS`
- `RC56_3_PHONE_TO_WEAR_STOP_COMMAND=PASS`
- `RC56_3_DATALAYER_END_TO_END=PASS`

## Alcance de la afirmación de hardware

`DEVICE_HARDWARE_TESTED=TRUE` queda limitado expresamente al alcance **ANDROID_WEAR_OS** validado arriba.

No se infiere ni se declara validación física Apple/iOS:

- `APPLE_XCODE_BUILD_RUN=FALSE`
- `APPLE_DEVICE_HARDWARE_TESTED=FALSE`
- `IOS_HARDWARE_CLAIMED=FALSE`

Las pruebas físicas temporales no modificaron producción, Supabase, canary remoto ni el repositorio.
