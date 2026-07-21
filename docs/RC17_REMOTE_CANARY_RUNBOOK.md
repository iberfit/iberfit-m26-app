# RC17 · Runbook de canario remoto

1. Ejecutar `backend/RC17_REMOTE_SCHEMA_READONLY.sql` con una identidad autorizada y conservar el resultado sin modificar la base.
2. Comparar las 52 filas remotas con `qa/rc17_command_registry.json`; cualquier diferencia bloquea la extensión.
3. Validar login, bootstrap, permisos y comandos con cuentas QA Coach y Cliente.
4. Desplegar exclusivamente el ZIP web RC17 en el proyecto de canario, nunca sobre producción directa.
5. Revisar iPhone, Android, tablet y escritorio; incluir pérdida y recuperación de red.
6. Observar errores, conflictos, latencia y colas. Ante cualquier desviación, revertir al artefacto M25.1 protegido.
7. Solo promover después de evidencia firmada y repetible.
