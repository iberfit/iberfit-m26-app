# IBERFIT M26 · Client-ready auth/UX

Base exacta: `74131c2f9646c41373a7a6425a921a6be633b621`.

## Alcance

- Mantener una sesión válida al cerrar y reabrir la aplicación, con migración desde la sesión transitoria anterior.
- No persistir contraseñas.
- Logout local fail-closed ya existente: limpiar el vault antes del sign-out remoto best-effort.
- Mostrar/ocultar contraseña con control accesible.
- Priorizar WebAuthn del propio dispositivo (`platform` + `internal`) y dejar QR/otro dispositivo como fallback explícito.
- Mantener user verification requerida.
- Corregir el lockup visual de acceso recortando el asset real de marca para no mostrar la zona sobrante del bitmap compuesto.
- Mantener la primera pintura estática alineada con la UI interactiva.

## No cambios

- No se modifica RLS.
- No se modifica la política de roles.
- No se revocan credenciales WebAuthn existentes.
- No se modifica Supabase PROD desde esta rama.
- No se despliega a LIVE desde esta rama.
