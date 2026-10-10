# IBERFIT Apple native compile readiness

The Apple runtime in this repository must be compiled and exercised on macOS with Xcode.

Windows validation may verify Swift source structure, package boundaries, permissions, and bridge contracts, but it must not report an Xcode/watchOS build as completed.

Before hardware validation:
- open the Apple package/targets in Xcode on macOS;
- enable the required HealthKit capability and usage descriptions in the consuming app;
- build the iOS and watchOS targets;
- run the companion iPhone + Apple Watch pair;
- confirm live heart-rate telemetry reaches the active IBERFIT session;
- confirm loss of reachability does not replay stale live samples later.

Hardware testing remains a separate release gate from source/static validation.

## CI de compilación real Apple

`.github/workflows/connected360-apple-native-qa.yml` ejecuta bajo macOS/Xcode:
- compilación con SDK iOS Simulator del target `IBERFITWebBridge`;
- compilación con SDK watchOS Simulator del target `IBERFITWatchTelemetry`;
- verificación de capabilities declaradas y prohibición de credenciales en fuentes Swift.

Se ejecuta en PR que modifiquen `native/apple/**` y también admite ejecución explícita. No requiere publicar una app ni acceso a datos personales.

**Límite:** compilar con SDK oficial no demuestra permisos concedidos, HealthKit funcional en hardware, enlace iPhone/Watch, distribución App Store ni sincronización automática certificada. Todo ello permanece bajo gates físicos independientes y `productionAllowed=false` hasta superar pruebas de extremo a extremo.
