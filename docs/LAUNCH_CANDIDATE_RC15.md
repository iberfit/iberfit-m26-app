# IBERFIT M26 · Launch Candidate RC15

RC15 consolida la aplicación integrada Coach/Cliente sobre el store canónico, Command Bus, catálogo protegido de 367 ejercicios, recuperación offline, engagement, progreso, alertas, inteligencia adaptativa y Design System.

## Garantías locales cerradas

- Todas las rutas visibles tienen contenido funcional; no quedan placeholders en las áreas autorizadas.
- Las acciones críticas usan Command Bus y esperan ACK antes de mostrar confirmación.
- Las cuentas Cliente no pueden acceder a notas privadas ni rutas Coach.
- El catálogo completo se busca sin escritura libre y sin limitar los resultados al subconjunto inicialmente renderizado.
- La navegación móvil ofrece acceso a todas las áreas autorizadas mediante navegación rápida y menú Más.
- Durante un constructor o una ejecución activa se evita cambiar de módulo accidentalmente; existe salida explícita y segura.
- Sesiones, temporizadores y operaciones pendientes conservan el aislamiento por usuario.
- La PWA excluye autenticación, RPC y REST de la caché.
- El artefacto web contiene CSP, HSTS, permisos mínimos y política no-store para la configuración runtime.

## Estado de despliegue

No desplegada. La configuración runtime entregada está deshabilitada y el ejemplo de canario exige una clave pública inyectada durante el despliegue. El paso remoto sigue bloqueado porque el conector Supabase quedó deshabilitado; por eso no se declara validación de los 52 comandos ni QA remoto autenticado.
