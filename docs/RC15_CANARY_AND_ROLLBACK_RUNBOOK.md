# RC15 · Runbook canario y rollback

## Preflight obligatorio

1. Ejecutar consultas de solo lectura y comparar exactamente los 52 comandos, funciones RPC, columnas y allowlist canaria.
2. Confirmar que producción M25.1 y sus archivos de rollback conservan sus hashes.
3. Inyectar `runtime-config.js` únicamente en el host canario exacto y mantener `qaOnly: true`.
4. Probar cuentas QA Coach y Cliente: login, bootstrap, permisos, IRI, plan, cita, sesión, check-in, hábitos, notas, conflictos y logout.
5. Ejecutar pruebas físicas en iPhone, Android, tablet y escritorio, incluida instalación PWA y pérdida/recuperación de red.

## Canario

- Allowlist exclusiva de cuentas QA y clientes sintéticos.
- Sin migraciones destructivas.
- Observación de errores, conflictos, latencia y reintentos antes de ampliar el grupo.
- Ningún dato pendiente se presenta como confirmado.

## Rollback

- Deshabilitar el runtime M26 del host canario.
- Retirar el artefacto RC15 y restaurar el artefacto M25.1 validado.
- No eliminar operaciones locales; exportarlas para diagnóstico antes de limpiar un dispositivo QA.
- Verificar login y rutas críticas de M25.1 después del rollback.
