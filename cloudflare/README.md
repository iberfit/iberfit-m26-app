# Kit de canario Cloudflare · RC29

Esta carpeta contiene configuración y documentación. No despliega automáticamente.

## Reglas obligatorias

- Utilizar un proyecto Pages dedicado para la aplicación; nunca el proyecto comercial de `iberfit.cl`.
- Dominio exclusivo del canario: `m26-canary.iberfit.cl`.
- No asociar `app.iberfit.cl` ni `coach.iberfit.cl` hasta la aprobación final.
- Construir con `npm run build:rc29`.
- Generar la configuración pública QA con `npm run configure:rc29:canary` solo en el artefacto de despliegue.
- La clave permitida en frontend es únicamente la clave publicable de Supabase; nunca `service_role`.
- Registrar ID del despliegue, commit, SHA-256 del artefacto y hora UTC.
- Rollback inmediato ante exposición cruzada, rol incorrecto, discrepancia de comandos, corrupción de sincronización o error de autenticación.
