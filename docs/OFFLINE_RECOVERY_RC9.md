# IBERFIT M26 RC9 · Recuperación offline y continuidad de sesión

## Objetivo

Evitar la pérdida de una sesión cuando el navegador se cierra, la PWA se suspende, se recarga la página o desaparece la conexión. El almacenamiento local nunca se presenta como confirmación remota.

## Diseño aplicado

- Persistencia versionada en IndexedDB con fallback de memoria.
- Aislamiento por `auth.user.id`; ningún usuario puede enumerar snapshots locales de otro usuario del mismo dispositivo.
- Snapshot por ejecución con sesión, cita, revisión, cola, resultados, feedback y temporizadores.
- Exclusión explícita de token, refresh token y cualquier contexto de autenticación.
- Temporizador activo acumulado mediante marcas absolutas.
- Descanso mediante `restUntil`, por lo que continúa correctamente tras cerrar la aplicación.
- Cola persistente de comandos con `operationId` estable y espacio separado por usuario autenticado.
- Reintento automático controlado al recuperar conectividad.
- Conflictos separados de pendientes y rechazos.
- Una revisión remota superior nunca pisa silenciosamente un progreso local no sincronizado.

## Reglas de estado

- `syncStatus=clean`: el servidor confirmó el estado.
- `syncStatus=pending`: el dispositivo conserva cambios pendientes de envío.
- `syncStatus=conflict`: existe una revisión remota incompatible; no se fusiona automáticamente.
- `syncStatus=rejected`: el servidor rechazó la operación; el contenido local se conserva para revisión.

Una sesión completada o cancelada con estado pendiente se muestra como guardada localmente, no como confirmada.

## Inicio offline

El inicio offline está bloqueado por defecto. Solo se permite cuando la aplicación posee un permiso canario cacheado que demuestra que la sesión y la cita ya fueron autorizadas. Continuar, pausar, reanudar, guardar series y finalizar una ejecución previamente autorizada sí puede encolarse offline.

## Limpieza

Al cerrar sesión se limpia el espacio local del usuario autenticado. Los snapshots confirmados y cerrados se eliminan. Los recuperables caducan a los 30 días. Un snapshot inválido o de otra versión se descarta de forma segura.
