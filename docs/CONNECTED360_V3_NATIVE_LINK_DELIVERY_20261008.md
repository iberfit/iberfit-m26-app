# Connected 360 v3 · Vincular una vez y olvidar la gestión
Fecha: 2026-10-08 · estado: arquitectura y UX piloto, **sin integración nativa certificada**.

## Contrato del producto
- Acción visible para todo Cliente con seguimiento activo: **Vincular dispositivo**. No mezclar un archivo importado con un reloj enlazado.
- Selección de origen → consentimiento oficial por categorías mínimas → evidencia de concesión remota → historial inicial acotado (30 días cuando corresponda) → sincronizaciones idempotentes; recuperar interrupciones sin solicitar permisos en bucle.
- Tras enlazar, datos confirmados en Dispositivos y salud, Actividad, sesiones y, para el Coach, solo los resúmenes expresamente compartidos. NUNCA se aplican cambios automáticos a prescripciones de carga, sesiones ni alertas clínicas.
- «Ahora no» sin castigo. Ajustes permite ver cuándo se sincronizó, pausar, reautorizar, revocar y borrar. Los estados pendientes, desconectado, sin datos, offline y expirado son distintos.
- Importación manual permanece disponible únicamente como opción avanzada de recuperación, sin texto engañoso de sincronización o vinculación.
- Prohibido activar botones, mensajes o métricas que simulen puentes inexistentes o acceso a datos no confirmado.

## Obstáculo de plataforma confirmado
La PWA no puede invocar directamente HealthKit de iOS ni la API Android Health Connect. El puente `IBERFIT_HEALTH_BRIDGE` existente es una interfaz, no una implementación distribuida. `productionAllowed=false` permanece en `free-policy.js` hasta completar certificación nativa.
- iOS: aplicación contenedora/compañera con entitlement HealthKit, permisos lectura separados por categoría, control de acceso mínimo y tareas de sincronización autorizadas. Costes de inscripción y distribución iOS deben verificarse y aprobarse antes de contratar algo.
- Android: aplicación Android con Health Connect oficial, permisos manifiesto y consentimiento `PermissionController`, lectura inicial y `WorkManager` si el dispositivo ofrece lectura en segundo plano y el usuario la autorizó. Pruebas en Android 13/14+ y Samsung Health vía Health Connect.
- Cloud: OAuth 2.0, PKCE/state, token refresh/rotation cifrada exclusivamente en backend, ámbito mínimo, revocación de proveedor, webhooks verificados y aislamiento por usuario. Las políticas/costes API y restricciones de exhibición al Coach deben revisarse individualmente antes de habilitar.
- Bluetooth directo no resuelve acceso a los datos históricos de Apple Watch/Garmin; no presentarlo como equivalente.

## Gates mínimos antes de habilitar conexión
1. Prueba con dispositivo y cuenta QA que realiza el enlace auténtico, guarda consentimiento versionado y recibe datos con `provider`, `sourceUpdatedAt`, calidad y origen de aplicación.
2. Autorización explícita de usuario vinculada al cliente, sin escalada a Coach/Admin, RLS activo, `clientId` de servidor, generación de consentimiento y revocación que gana a importaciones concurrentes.
3. Duplicados/solapamientos por fuente y día resueltos sin sumar pasos de dos agregadores; no mezclar importación manual de archivo con conexión automática en estados ni contadores.
4. App foreground/background/offline/sesión expirada/resume/múltiples dispositivos, borrado voluntario y recuperación, todos con loading/success/error/retry.
5. Experiencia de cliente nuevo y existente, desktop/mobile/iOS/Android, accesibilidad táctil, foco y sin bloquear bienvenida o navegación.
6. Coste recurrente compatible con política gratuita, backend sin secretos públicos, pruebas CI+E2E y versión Canary LIVE exacta; luego promoción PROD con rollback.

## Estado implementado en este PR
- Panel Cliente visible de dispositivos con acción principal, disponibilidad real por proveedor y estadísticas confirmadas (pasos, sueño, FC en reposo), diseño premium responsive.
- Opciones de importación, gestión y datos históricos conservadas, pero relegadas a secciones secundarias.
- Ajustes: resumen de métricas confirmadas y procedencia de archivo; sesiones: resumen de recuperación **pasivo** a partir del mismo origen autorizado.
- Invitación inicial conduce a selección de dispositivo, no abre el importador oculto. Seguridad fail-closed sobre procedencia: un archivo o un estado legado sin evidencia no aparece como reloj sincronizado.
- Pendiente fuera de este PR: aplicación nativa firmada/distribuida y OAuth cloud real. NINGUNA conexión nativa ha sido activada en producción.

Fuentes oficiales de implementación: Apple HealthKit (developer.apple.com/documentation/healthkit/authorizing-access-to-health-data), Android Health Connect (developer.android.com/health-and-fitness/health-connect/get-started), Strava OAuth (developers.strava.com/docs/authentication).
