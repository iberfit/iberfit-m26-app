# IBERFIT RC39 integrado

Alcance aprobado y consolidado en una sola rama:

- RC39A: App Cliente multidispositivo, planificación híbrida, resumen presencial, sesiones autónomas completas, confirmación desde 48 h y calendario.
- RC39B: centro operativo Coach, agenda contextual y ejecución independiente de la modalidad contractual.
- RC39C: cuenta multirrol Coach/Admin con selector de aplicación y aislamiento de contexto.

## Reglas centrales

1. La modalidad contractual del cliente no bloquea ninguna sesión del Coach.
2. Una sesión presencial para cliente híbrido usa `summary_only`: aparece por día y hora, pero no se reproduce.
3. Una sesión autónoma usa `full` y `client_autonomous`: contenido completo y botón Comenzar.
4. Coach y Admin pueden ejecutar cualquier sesión autorizada.
5. La confirmación del cliente se abre 48 horas antes y cierra 2 horas antes.
6. El calendario usa UID estable para actualizar sin duplicar.
7. El rol activo de interfaz nunca concede permisos: debe estar incluido en `authorizedRoles`.
8. `iberfit.cl@gmail.com` necesita los roles backend `coach` y `admin`.

## Backend

`backend/RC39_CARLOS_MULTIROLE.sql` es aditivo, pero el aplicador no lo ejecuta. Debe revisarse en el SQL Editor canary y solo después integrarse en el bootstrap para que devuelva `roles`.

## Producción

El aplicador no despliega, no modifica producción, no ejecuta SQL y no toca el Sheet.
