# IBERFIT · Connected 360 Android Health Connect · módulo nativo inicial

**Estado: código aislado en rama WIP, NO distribuido ni conectado a producción.**
La PWA de app.iberfit.cl no puede acceder directamente a Health Connect. Este proyecto es una librería Android de lectura, para integrar después en una aplicación firmada que entregue datos exclusivamente a la sesión Cliente autenticada mediante un puente de origen restringido. La librería sola no instala una app ni sincroniza con Supabase.

## Implementado
- SDK oficial AndroidX Health Connect 1.1.0 estable.
- Solo lectura de pasos, sueño y FC en reposo en ventanas civiles con zona horaria real, máximo 30 días.
- Permisos específicos de lectura comprobados antes de cada consulta; no permiso de escritura, historial ampliado ni lectura en segundo plano.
- Agregados oficiales para pasos y sueño, evitando sumar fuentes solapadas. Dato ausente = null, no cero. No se transfieren mediciones fuera del dispositivo en este módulo.
- Test unitario DST, fechas locales y contrato de permisos.

## Avance de este macro-WIP: reutilizar la app IBERFIT Android existente
- Se añade a `native/android-host/phone-app` un acceso de QA a **la autorización oficial** de Health Connect y una lectura **exclusivamente local** de los últimos siete días (pasos, sueño en horas y minutos y FC en reposo).
- El nuevo flujo reutiliza `IberfitHealthConnectReader` de este WIP; no crea una segunda APK ni otra aplicación paralela. Incluye rationale compatible con Android 13 y Android 14+, botones activados solo por el usuario, estado sin datos y recuperación ante errores.
- La lectura local NO requiere `clientId` de demostración, nunca envía registros y no declara vinculada la cuenta IBERFIT. Los permisos Health Connect por sí solos no son consentimiento para subir datos al servidor.
- CI adicional intenta compilar la `phone-app` existente. La app aún no está distribuida ni conectada al backend. La política de privacidad de la app de distribución debe coincidir con el texto aprobado de Google Play antes de comercializar.

### Canal web restringido de QA (todavía sin datos)
- `Connected360SecureWebViewActivity` abre **solo Canary**, exige HTTPS y origen exacto `m26-canary.iberfit.cl`, bloquea navegación de marco principal fuera del dominio y cancela fallos TLS. Solo reconoce mensajes de marco principal del origen esperado mediante `WebViewCompat.addWebMessageListener`.
- La respuesta del canal `IBERFIT_CONNECTED360_QA` siempre declara `available=false`, `connected=false`. No expone el contrato `IBERFIT_HEALTH_BRIDGE` ni transmite pasos, sueño, FC, tokens, identidades o identificadores de consentimiento. Tampoco solicita permisos a Health Connect.
- El permiso Android `INTERNET` sirve para cargar la página Canary en esta vista de QA, **no para transferir datos de Health Connect**. Se mantienen prohibidas las interfaces JavaScript genéricas.
- Pruebas Kotlin verifican bloqueo de HTTP, subframes, dominios semejantes, userinfo y puertos inesperados. La firma, políticas OAuth/Hosted Auth, vinculaciones autenticadas y QA E2E siguen sin resolver.

## Bloqueadores antes de distribuir una app real
1. App Android firmada; pantalla oficial Health Connect de autorización con selección granular y política de privacidad; Android 9+, Samsung y Pixel probados.
2. Sesión autenticada IBERFIT Cliente; puente WebView exclusivo para https://app.iberfit.cl usando WebViewCompat.addWebMessageListener, validando sourceOrigin e isMainFrame, sin addJavascriptInterface genérico.
3. Mensajes con esquema y request ID, timeout y reintentos, origen externo bloqueado, recuperación offline/foreground/background y desconexión real.
4. Adaptador al contrato JS IBERFIT_HEALTH_BRIDGE.healthConnect, sincronización mediante remoto autorizado con generación de consentimiento y RLS en backend. NO activar productionAllowed sin E2E con app firmada.
5. Revocación y eliminación sin carreras ni restauración accidental; no abrir permisos al iniciar sin acción del usuario.
6. Nada sensible en logs/analytics ni credenciales expuestas; datos solo del propio Cliente y no interpretaciones clínicas automáticas.
7. QA Gradle + instrumentación Android real y promoción certificada Canary→PROD.

## Ejecución de pruebas
gradle -p native/android-health-connect :healthconnect:testDebugUnitTest :healthconnect:assembleDebug

Referencia: https://developer.android.com/health-and-fitness/health-connect/get-started

**IBERFIT actual no tiene app nativa instalada**: no anunciar conexión ni sincronización automática finalizada.
