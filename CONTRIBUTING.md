# Contribución a IBERFIT M26

1. Trabajar siempre en una rama dedicada. Nunca hacer commits directos a `main`.
2. Mantener M25.1 y M25.2 byte a byte sin cambios.
3. Añadir o actualizar pruebas para cualquier cambio de comportamiento.
4. Para cualquier pull request hacia `main`, ejecutar el gate RC64 local: `node scripts/check_utf8_mojibake.mjs`, `node scripts/generate_rc58_app_shell.mjs --check`, `npm test`, `npm run quality:rc64:browser`, `npm run quality:rc64:real-shell` y `npm run quality:rc64:performance`. La validacion historica/prepublicacion `npm run validate:rc29` se conserva para RC29 y no sustituye el gate de `main`.
5. No marcar como aprobados gates remotos, físicos o de producción cuando solo se hayan simulado.
6. No desplegar desde una rama de pull request.
7. La Inteligencia IBERFIT propone; el entrenador revisa y decide.
8. No incorporar datos reales, contraseñas, JWT privados ni claves `service_role`.
9. Production source-of-truth: `main`. `prepublicacion/rc29` queda solo como referencia historica y no es una fuente valida de despliegue.

Cada pull request debe describir alcance, riesgos, evidencia, comparación de capas protegidas y efecto sobre rollback.
