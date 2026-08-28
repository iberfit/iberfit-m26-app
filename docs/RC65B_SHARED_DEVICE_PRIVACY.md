# RC65-B · Privacidad en dispositivo compartido

Base canónica cerrada: `b03eefb19c08039da820c0503bf52670478ae7a7`

## Objetivo

Separar dos acciones con semántica distinta:

1. **Cerrar sesión**: elimina credenciales y estado en memoria, pero conserva los datos
   locales sellados por `ownerId` para permitir recuperación posterior de trabajo
   pendiente del mismo usuario.
2. **Cerrar sesión y borrar datos de este dispositivo**: después de confirmación
   explícita, elimina únicamente los datos locales pertenecientes al usuario
   autenticado actual.

## Datos locales incluidos en el borrado explícito

- cola de operaciones offline;
- borradores de actividad;
- recuperación de ejecución;
- outbox de telemetría;
- cola local wearable;
- plantillas de sesión;
- vistas/recientes de productividad;
- preferencias de experiencia.

No se eliminan cachés PWA de activos estáticos porque no contienen identidad ni trabajo
del usuario.

## Seguridad

- Nunca se usa un borrado global del almacenamiento.
- Cada almacén se borra por el namespace del `ownerId` actual.
- Los datos de otro owner en el mismo navegador se preservan.
- Antes de borrar se inspeccionan operaciones/drafts/recovery/telemetría/wearables.
- Si hay pendientes, el mensaje advierte que pueden perderse permanentemente.
- Si la inspección es incompleta, el mensaje falla cerrado y advierte igualmente.
- Los datos ya sincronizados en IBERFIT no se eliminan por esta acción.
- Si una limpieza local falla, se cierra la sesión por privacidad pero la UI NO afirma
  que el dispositivo quedó completamente limpio.

## Evidencia de regresión

`tests/m26_rc65b_shared_device_privacy.test.mjs` verifica:
- inventario y advertencia de pendientes;
- fallo cerrado de inspección;
- borrado parcial no presentado como éxito;
- aislamiento A/B de la cola de operaciones;
- aislamiento A/B de plantillas;
- aislamiento A/B de preferencias;
- aislamiento A/B de productividad;
- separación visible y de eventos entre logout normal y borrado destructivo.
