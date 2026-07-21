# Contribución a IBERFIT M26

1. Trabajar siempre en una rama dedicada. Nunca hacer commits directos a `main`.
2. Mantener M25.1 y M25.2 byte a byte sin cambios.
3. Añadir o actualizar pruebas para cualquier cambio de comportamiento.
4. Ejecutar `npm run validate:rc29` antes de abrir una pull request.
5. No marcar como aprobados gates remotos, físicos o de producción cuando solo se hayan simulado.
6. No desplegar desde una rama de pull request.
7. La Inteligencia IBERFIT propone; el entrenador revisa y decide.
8. No incorporar datos reales, contraseñas, JWT privados ni claves `service_role`.

Cada pull request debe describir alcance, riesgos, evidencia, comparación de capas protegidas y efecto sobre rollback.
