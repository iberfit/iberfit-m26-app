# Connected360 — historial deportivo automático (POST-GX350)
Estado: implementación parcial en PR #1477; no es una certificación física ni un anuncio de disponibilidad productiva.

## Objetivo de producto
Una autorización explícita y revocable por categoría; al abrir o retomar IBERFIT se importan automáticamente las actividades disponibles desde el móvil y sus fuentes autorizadas. Mostrar cada actividad, no únicamente un contador. Permitir al Coach consultar evidencia externa pertinente sin convertirla en ejecución de una prescripción ni adherencia confirmada. Evitar duplicar Connected360, las colecciones de entrenamiento, las tablas de consentimiento o los procesos de sincronización.

## Verificado en código (base b726e818)
- Android nativo y web: V46/V47, consentimiento remoto por generación, permisos del SO, sincronización foreground y resumen propietario con límites de 7 días/10 actividades. Hay controles de activación de servidor; no se presupone que estén habilitados.
- La lectura actual de sesiones usa Health Connect y agrega métricas de la misma fuente. Su identidad opaca ya soporta idempotencia por registro. No verifica el reloj físico y no deduplica automáticamente una actividad replicada por dos aplicaciones distintas.
- Apple dispone de infraestructura HealthKit y QA; la escritura productiva de sesiones externas iOS no está acreditada. Las fuentes OAuth directas no están certificadas.
- La aplicación web por sí sola no tiene acceso a HealthKit ni Health Connect; necesita un host nativo autorizado o conexión cloud certificada.

## Cambio incluido
Detalle de las actividades en la misma vista y lectura de Connected360 existente: disciplina, fecha, duración, distancia disponible, origen y límites explícitos. Sin peticiones ni tablas adicionales. Android prioriza la página más reciente y filtra entrenamientos incompletos/futuros antes del límite de lote. Se preservan los límites, permisos y protocolos de ingestión.

## Pendientes de implementación y aceptación obligatoria
1. Adquisición incremental paginada: carga inicial limitada a permisos efectivos (Android normalmente hasta 30 días previos a la autorización), cursor por propietario/fuente/grant, recuperación de páginas, acuse duradero antes de avanzar, actualizaciones y borrados de fuente. Presupuesto Free acotado, sin polling continuo ni subir GPS crudo. No presentar el límite de lote como historial completo. Ninguna ampliación de scope implícita.
2. Read model paginado sobre los datos existentes, histórico desde cualquier dispositivo con sesión válida, no solo el host nativo. Coach: proyección mínima por asignación y consentimiento específico para compartir datos de salud; Admin: estado operativo, no datos sensibles por defecto. RLS, revocación y borrado verificados antes de habilitar lectura.
3. Métricas adicionales por disciplina con permisos y contratos independientes cuando proceda: distancia, ritmo, potencia, cadencia, natación, intervalos y segmentos si la fuente realmente los entrega. Nada de inventar ejercicios, cargas, series, calorías o identidad de reloj. No duplicar una misma sesión al llegar por Health Connect/HealthKit/Strava; resolver reconciliación mediante identificador de fuente o enlace explícito, no borrar coincidencias aproximadas.
4. iOS: HKWorkout + consultas incrementales/ancladas, cambios y revocación, host firmado; background solo con entitlement y permisos aplicables. Android: lectura foreground primero; background posterior cuando soporte, permisos y presupuesto estén certificados. No prometer sincronización instantánea con aplicación cerrada.
5. Aceptación física: Android e iOS con actividad creada en reloj y sincronizada al teléfono; primer permiso, entrada, retorno, offline/online, 11+ registros, más de una página, correcciones/borrado, dos fuentes que replican una actividad, cambio de cuenta y revocación concurrente. Verificar historial Cliente/Coach, aislamiento y deduplicación, sin modificar IRI ni el historial de ejecuciones IBERFIT. No habilitar ni anunciar compatibilidad antes de esta evidencia.

Referencias oficiales:
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery
- https://developer.apple.com/documentation/healthkit/executing-observer-queries
