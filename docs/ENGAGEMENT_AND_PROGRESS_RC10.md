# IBERFIT M26 · RC10 · Progreso, adherencia y engagement

## Alcance cerrado

RC10 incorpora sobre el store canónico:

- resumen de progreso de 28 días;
- adherencia basada únicamente en sesiones planificadas y ejecuciones confirmadas;
- RPE medio, volumen observable e historial IRI;
- cronología de IRI, ejecuciones y check-ins;
- alertas explicables de dolor, recuperación, adherencia y calidad del dato;
- centro de verificación para pendientes, conflictos y rechazos;
- recuperación de borradores de check-in aislada por usuario y cliente;
- rutas Coach/Cliente para Progreso y Actividad;
- ruta privada Coach/Admin para notas internas.

## Regla de datos

La ausencia no equivale a cero. Cuando no existe denominador, ejecución, RPE, volumen, check-in o segunda evaluación IRI, la interfaz muestra `Sin dato` o `Sin registro`.

Las alertas no diagnostican ni deciden automáticamente. Presentan evidencia, límite y siguiente pregunta para el Coach.

## Límite backend detectado

El catálogo canónico vigente contiene 44 comandos y no incluye todavía check-ins, hábitos ni notas privadas. RC10 no reutiliza comandos incompatibles ni presenta borradores como confirmados.

La publicación remota permanece bloqueada hasta que el backend instale y valide el contrato de extensión incluido en `backend/RC10_ENGAGEMENT_COMMAND_CONTRACT.json`, sus transiciones, RLS, bootstrap y pruebas por rol.

## Privacidad

- Los borradores quedan separados por usuario y cliente.
- No se guardan credenciales.
- Las notas privadas no se persisten localmente como sustituto del backend.
- El cliente no recibe navegación ni acceso a notas privadas.
