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
- La pantalla nativa de lectura local NO requiere `clientId` de demostración y NO sube datos al servidor. El canal de prueba separado puede entregar resúmenes a la página autenticada de Canary tras un permiso local de un solo uso. No declara vinculada la cuenta IBERFIT. Permisos Android y consentimiento de almacenamiento remoto son independientes.
- CI adicional intenta compilar la `phone-app` existente. La app aún no está distribuida ni conectada al backend. La política de privacidad de la app de distribución debe coincidir con el texto aprobado de Google Play antes de comercializar.

### Piloto Android → Canary: lectura real y persistencia manual optativa (solo DEBUG)
- `Connected360SecureWebViewActivity` reutiliza la app Android existente y abre solo **Canary** mediante HTTPS/origen exacto `m26-canary.iberfit.cl`; exige marco principal, evita navegación a otros orígenes, rechaza certificados TLS erróneos y no utiliza interfaces JavaScript legadas.
- La pantalla Android incluye un botón explícito **«Permitir UNA lectura local»**. El permiso expira al utilizarlo, navegar o salir. Además, Health Connect comprueba los permisos efectivos antes de consultar hasta **7 días** de pasos/sueño/FC en reposo. No se solicita lectura en segundo plano.
- El transporte `IBERFIT_CONNECTED360_QA` devuelve `available=false`, `connected=false` al sondeo normal para no simular una vinculación certificada. **Solo después de la aprobación local**, la acción explícita `health.readDaily` puede entregar un pequeño resumen a la página Canary. Es una **transferencia del proceso Android a la página de la aplicación**, no una escritura remota ni una sincronización automática.
- El módulo web `qa-native-channel.js` exige sesión Cliente activa, token existente y contexto propietario/cliente estable al iniciar y terminar. El token, propietario y `clientId` no se envían a Android. El resultado conserva `acquiredAt` como momento de lectura, **no** inventa `sourceUpdatedAt` ni permite que la vista local aparezca como dato sincronizado.
- La primera lectura **nunca** escribe en Supabase ni crea consentimientos. Solo al marcar la casilla de aceptación y pulsar **«Autorizar e incorporar (QA)»** se llama a la generación de consentimiento del servidor y se comprueba de nuevo antes de importar por la RPC protegida `m26_wearable_import_authorized_v2`. El servidor decide la identidad del cliente y protege el límite de revocación. **No hay cola offline de datos de salud ni reintentos automáticos.**
- Los controles DEBUG se ocultan fuera de compilaciones depurables y la Activity de QA rechaza cualquier entrada en compilación RELEASE.
- **Frontera de navegación/lifecycle:** cada solicitud se ata a una generación de documento WebView. Al navegar, bloquear una navegación externa, perder el primer plano, encontrar un error TLS o destruir la Activity se invalida la generación y queda prohibido responder al documento anterior. El cliente debe realizar una nueva lectura voluntaria tras volver. El cierre de pantalla no preserva aprobación local.
- Pruebas Kotlin y Node cubren origen, HTTP/subframes, mensajes correlacionados, sesión de Cliente, permisos parciales, descartes concurrentes, revocación, caducidad de previews, falso grant, confirmación explícita y validación de la respuesta del servidor. **Una compilación verde no equivale a un E2E físico**: faltan pruebas con Pixel/Samsung, giro/reanudación, logout, permisos revocados y recuperación offline.
- **Límite fundamental:** comprobar la identidad del Cliente dentro de JavaScript **no prueba criptográficamente esa identidad ante el código Android**. Este canal no puede usarse para una conexión real hasta incorporar autenticación de extremo a extremo, consentimiento de servidor y pruebas físicas.

### Contrato de privacidad y fechas en la prueba QA
- El Cliente ve primero una **vista previa local**, sin transferencia al backend. Puede descartarla, rechazar la importación, revocar la fuente o borrar los datos importados.
- La confirmación del Cliente se hace mediante **casilla independiente**, no mediante un diálogo JavaScript del WebView, y se exige una segunda pulsación para iniciar la escritura. Se requiere conexión al servidor y sesión Cliente vigente antes de enviar el lote. Si hay desconexión no se crea una cola sanitaria local.
- La fuente nativa solo entrega métricas concedidas por Android. Un campo ausente no se transforma en cero. La importación QA conserva `quality='limitada'` hasta que haya una certificación de procedencia y cobertura.
- `acquiredAt` expresa **cuándo IBERFIT volvió a agregar las métricas diarias de Health Connect**, no cuándo se midió cada valor ni cuándo el reloj actualizó su base. El esquema v44 únicamente tiene `sourceUpdatedAt`; la integración QA lo rellena con el instante de esa nueva agregación para permitir control de versiones. **No interpretar ese campo como prueba de actualidad de una medición**. Antes de producción debe separarse formalmente `acquired_at` de `source_updated_at` en el contrato de persistencia y en el etiquetado de confianza.
- La escritura es solo una **importación manual de prueba**, no un dispositivo vinculado. La metadata remota distingue `confirmed_import` de `certified_native`. Ningún flujo de producción anuncia sincronización automática ni cambia `productionAllowed=false`.

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
