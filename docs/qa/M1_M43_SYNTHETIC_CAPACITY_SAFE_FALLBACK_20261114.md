# IBERFIT M1 · Capacidad de certificación M43 (QA, 14/11/2026)

**No es aprobación para producción.** PR #1335, QA `gjztkdwfmunnzhtvxrsu`; la limpieza de datos productivos sigue excluida.

## Evidencia READ-ONLY
En el último control, QA A tenía 754 sesiones históricas con título M43, de las cuales la huella de retención congelada v3 permite excluir exactamente las 601 que conserven estado terminal, ámbito, ID y revisión; la cuota de **150 sesiones vigentes no se modifica**. El resultado previo del gate fue `M43_QA_SYNTHETIC_FIXTURE_BUDGET_EXHAUSTED`. QA B tenía 18 sesiones M43, 0 ejecuciones activas/pausadas, 0 sesiones M43 en curso y 1 asignación activa de coach, sin conflicto de ejecución.

## Solución de código, sin mutación SQL
El escritor M43 verifica primero la regla exacta para aislamiento de la ejecución U47 y, si no aplica, habilita **solo** la alternativa QA B cuando A no tiene margen para reservar las tres sesiones necesarias. La selección de B requiere entorno QA en ambos bootstraps autenticados, rol Cliente, dos IDs independientes válidos, entidades exclusivamente del B, ningún entrenamiento en curso ni ejecución activa/pausada, servicio de entrenamiento activo, y al menos tres plazas libres bajo el tope **150**. Si falta algo, el selector no hace fallback y el gate falla cerrado como antes. Se conserva la comprobación real de permiso Coach sobre el B elegido.

El artefacto de la prueba debe registrar `primaryFixtureBudget` y `fixtureBudget`; `m43-writer-handoff.mjs` verifica la selección B solo por `QA_PRIMARY_BUDGET_SAFE_FALLBACK` y las cuentas exactas, además de runId, intento y SHA. Los navegadores siguen recibiendo la etiqueta de identidad exclusivamente mediante artefactos firmados del mismo workflow; no se aceptan contraseñas con roles elevados ni credenciales de servicio. No se modifican migraciones, RLS, datos, grants ni historial.

## Pendientes de certificación
- Reejecutar M43 completo autenticado Coach→Cliente B→Coach y los navegadores actuales; deben conservarse pruebas de inicio, pausa, reanudación, sets, finalización y lectura tras recarga. El cambio no se declara correcto por pasar tests unitarios.
- Los HTTP 500 intermitentes del bootstrap QA A siguen siendo incidencia propia. No se ocultan ni se eliminan de los tests de A. Confirmado SQLSTATE 57014 en Supabase QA el 14/11/2026.
- El ensayo U71 de dos fechas no puede iniciar nuevas ocurrencias a última hora de Santiago; repetir en una ventana válida sin alterar citas existentes.
- PROD U60 sigue cerrado hasta CI exacto, respaldos M44 reales, restauración probada, Canary y promoción protegida.
