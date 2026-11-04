# IBERFIT U60 — Training360 · lote funcional consolidado

Estado: preparado en un único PR de integración. **No equivale a una activación de la ejecución multifecha en producción.**

## Contrato de producto

**Sesión = prescripción. Fecha = ocurrencia. Entrenamiento = ejecución.** Una prescripción publicada puede tener varias fechas sin crear registros duplicados de ejercicios. Cada ocurrencia conserva su propia ejecución, estado, idempotencia, CAS y evidencia de finalización. Nunca transformar una sesión supervisada en autónoma mediante un badge o un botón.

La superficie de Cliente conserva prioridad de entrenamiento disponible, navegación por fecha y acceso al histórico; Coach conserva su constructor, propuesta/confirmación de cita y vista operacional. Admin mantiene autorización independiente. Se preservan los informes R50, separados del diagnóstico IRI inicial.

## Código preparado en el lote

- `training360-decision-pack.js`: decisiones basadas únicamente en fuentes ya autorizadas; deduplica por ocurrencia y revisión, exige correlación ejecución-sesión-Cliente, calcula las fechas vencidas verificadas y advierte inconsistencias. No lee datos personales sin autorización ni inventa tendencias cuando hay muestra insuficiente. No consulta Supabase ni añade llamadas al bootstrap.
- `occurrence-private-reader.js`: verificación estricta de rol, Cliente, identidad remota, snapshot, cola de ejercicios y correspondencia de ejecución antes de devolver datos. Desactivado por defecto. **No utiliza U33 CALENDARIO como detalle privado**.
- `occurrence-coach-batch-publisher.js`: un solo comando `OCURRENCIAS_CREAR_LOTE` con journal cifrado persistido antes de enviar, protección entre pestañas, idempotencia de operación, recuperación exacta y validación del ACK. El navegador no crea duplicados tras una respuesta perdida.
- `occurrence-runtime.js`: ensamblaje bajo opt-in explícito de coordinador U40, batch Coach, motor U49, checkpoint U51 y almacenaje cifrado U42/U45. No se monta al arrancar sesión ni obtiene token o clave criptográfica del almacenamiento público.
- La vista R50 de planificación y Hoy incorpora un pequeño resumen cuando existen ocurrencias ya escopadas por el servidor; no cambia CTA de inicio, permisos, rutas ni experiencia cuando no hay ocurrencias.
- PWA: nuevas rutas de módulos registradas y versión de caché `m26-rc63-6`, rollback hacia `m26-rc63-5`, historial de caches anteriores retenido.

## Condiciones de activación NO satisfechas todavía

1. QA `gjztkdwfmunnzhtvxrsu` ya tiene U30–U36, pero sin versiones correspondientes en `supabase_migrations.schema_migrations`; comprobar esquema exacto y reconciliar el ledger sin recrear estructuras ni tocar datos existentes.
2. Falta lectura privada auténticamente autorizada por backend que proporcione `prescriptionSnapshot` + `executionBody` desde la ocurrencia exacta, sin acceso general a tablas ni filtrado solo del frontend. La capa `occurrence-private-reader` valida respuestas, **no concede acceso**.
3. Falta fence transaccional de `SESION_INICIAR` heredado para prescripciones con ocurrencias, y su ensayo de concurrencia contra U32/U31. Los guardas de UI no sustituyen autorización SQL.
4. RPC U36 permanece sin EXECUTE para roles web. No habilitar con un flag; hacer migration/grant mínimo explícito posterior a readback y QA con 2 Clientes, Coach y Admin.
5. Pruebas reales por rol y dispositivo: 2+ fechas, 2 pestañas, ACK perdido, refresh JWT, reconexión offline, IndexedDB denegada, DST `America/Santiago`, revisión de Coach, RLS, accesibilidad y egress Supabase Free.
6. M44 cifrado DB+Storage y restore aislado renovado antes de una promoción que toque SQL, TTL `<=2h`. Mantener CI, exact-SHA, rollback y promoción protegida sin probar en PROD.

## Criterio de cierre

El ultramacrobloque **solo está totalmente entregado** cuando un usuario Cliente autorizado puede recibir, iniciar, registrar, reanudar y completar cada fecha de manera independiente, Coach lo ve con historial verificable y los gates QA/Canary/PROD reales están aprobados. Una suite Node exitosa o una PR en borrador no equivalen a ese cierre.

**Ritmo de integración:** una única actualización consolidada y un solo ciclo de CI para el lote; agrupar fallos y arreglos antes del siguiente SHA. No abrir varios PR WIP paralelos ni repetir lecturas de esquema inútilmente.


## Paquete de hardening U60 (preparado, NO aplicado)

Los objetos SQL del archivo `20261104150000_u60_closed_private_read_legacy_writer_fences.sql` se incorporan como **staging cerrado**. No se modifican los grants de U36. El RPC `iberfit_occurrence_detail_v1(uuid,uuid)` nace sin permisos EXECUTE para `PUBLIC`, `anon`, `authenticated` y `service_role`; un JWT no autoriza el acceso sin una futura migración acotada, revisada y certificada.

- La función privada U60 verifica `auth.uid()`, rol Cliente/Coach, permiso real de acceso al cliente, bandera canary server-side, pertenencia de la fecha, cita vinculada, estado publicado del origen y consistencia entre `domain_entities_v26` y `session_executions`. Devuelve exclusivamente claves aprobadas; `publishedSnapshot` del servidor se excluye deliberadamente. Nunca SELECT general al Cliente sobre tablas privadas.
- Barreras transaccionales sobre el INSERT de `session_executions`, `active_execution_locks_v26` y ocurrencias: serializan por cliente mediante `schedule_client:` junto a los locks ya existentes de ejecución, rechazan un inicio legacy para una prescripción con historial de ocurrencias incluso canceladas, sin bloquear la ruta U31 válida con `occurrence_id`. No reemplazan los guards R50 ni alteran SQL productivo todavía.
- Transporte `occurrencePrivateRead` exige JWT y dos UUID exactos; solo QA, sin reintento de escrituras ni fallback legacy. El runtime opt-in usa por defecto el lector de identidad verificada U60. Si RPC no autorizada, falla cerrada y no activa la función Cliente.
- Reversión sin pérdida de datos: `supabase/rollbacks/20261104150000_u60_closed_private_read_legacy_writer_fences.rollback.sql` elimina solo los objetos U60, en orden inverso, sin borrado de ejecuciones/citas, sin DROP de U30–U36 y sin cambiar RLS.

### NO GO de backend hasta evidencia real

1. **Reconciliación QA previa a DDL**: comparar la definición física de las siete migraciones U30–U36 y dependencias #1072, las funciones SQL reemplazadas por posteriores migraciones, owner/grants, triggers, índices y constraints frente a la fuente. El ledger QA carece de versiones `20261025*` pese a objetos presentes. No reparar histórico ni aplicar migraciones a ciegas. Guardar diferencias y rebaseline reversible si fuera necesario.
2. **QA real transaccional** en dos conexiones: ninguna prescripción puede iniciar a la vez por v26 y U31; probar U31=ejecución asociada correcta, U32=dos fechas independientes, repetición del mismo operationId, CAS de dos dispositivos, orden de locks, rollback sin filas huérfanas, cancelar/reprogramar, horario ambiguo/inexistente DST Santiago.
3. **A/B roles**: Cliente propio, Cliente ajeno, Coach autorizado y sin autorización, Admin (prohibido en la lectura U60), anónimo, JWT expirado; verificar explícitamente 401/403 y ausencia de filtración por status, UUID y errores. Comparar salida privada con contrato U47/U49.
4. **Autorización de escritura** en un cambio versionado posterior separado de la creación cerrada; scopes mínimos. No abrir U36 ni la lectura hasta recibir GO del backend autenticado. CI final exact-SHA, E2E Cliente/Coach en móvil/tablet/escritorio, QA WRITE, Device y M44 backup+restore <=2h antes del release real.
5. **Producción**: ningún SQL/Edge/Auth aplicado por este documento o este PR. Evaluar SQL/rollback por carril protegido en una ventana posterior; promoción frontend solo cuando backend esté realmente disponible. La versión U60 no debe afirmar que la ejecución multifecha funciona mientras está cerrada.

**Cadencia**: preservar el WIP único #1273, agrupar cambios y fallos, un solo commit de integración/ciclo CI para el lote grande y checkpoint #1260 con distinción preparación/commit/Canary/PROD.


## Reconciliación QA U30–U36 verificada por catálogo (READ-ONLY)

Auditoría del 04/11/2026 sobre Supabase QA `gjztkdwfmunnzhtvxrsu`: la comparación exacta de los cuerpos de 8 funciones (incluido helper U32), propietarios `postgres`, `search_path`, volatilidad, `SECURITY DEFINER` y EXECUTE confirman 8/8 fuentes idénticas y 0 grants públicos. RLS y ACL privados de la tabla, dos triggers U30/U32, FK del mismo Cliente, FK de ejecución, índices de unicidad y lock `active_execution_client:` del ejecutor RC29 comprobados. **Falta la procedencia del historial**: 0/7 entradas de migraciones U30–U36 en `supabase_migrations.schema_migrations`. No es una razón válida para volver a ejecutar las migraciones históricas.

Se incorpora `scripts/u60/qa_readonly_reconciliation.sql`: manifiesto de huellas SHA-256 de definiciones comprobadas y diagnóstico sin mutaciones (`ready_for_u60=false` mientras siga sin conciliar el historial). La migración U60 exige explícitamente **7/7 entradas del historial, 8/8 huellas coincidentes, ACL/RLS seguros, FK, triggers, índices y lock legacy** antes de crear ninguna función o trigger. El gate falla cerrado; no existe reparación automática del ledger ni DDL ejecutado por estas comprobaciones.

**Reparación autorizable:** tras revisión SQL final, usar reparación oficial del historial de migraciones solo para las siete versiones exactas verificadas, con inventario previo, prueba de no diferencia de schema, evidencia trazable y rollback del propio historial. No editar manualmente el ledger mientras la paridad integral no esté certificada. A continuación aplicar el SQL U60 cerrado en QA, probar rollback y role/IDOR/CAS con JWT reales y únicamente después valorar una migración de permisos específica. **Ninguna función U60 expuesta y ninguna mutación de QA/PROD se ha realizado aquí.**

El lector privado U60 también contrasta `execution_status` del mirror tipado con los estados canónicos y exige `remote_confirmed_at` para ejecuciones completadas, rechazando inconsistencias antes de presentar datos.


### Blindaje de actualización legacy (misma entrega U60)

La inspección real del ejecutor RC29 confirma que comparte `active_execution_client:`, mientras `iberfit_persist_entity_v26_rc29` inserta/actualiza `session_executions` por `ON CONFLICT` y nunca establece el nuevo `occurrence_id`. Por ello U60 no puede limitarse a un guard de INSERT: una ejecución U31 ya iniciada podría recibir una actualización legacy sobre la misma fila tipada. Se añade un trigger BEFORE UPDATE de identidad/revisión (conserva las ejecuciones históricas con `occurrence_id IS NULL`) y un **constraint trigger diferido hasta COMMIT** para las filas U31 que verifica un recibo real de la misma transacción, actor autenticado, Cliente, ocurrencia, ejecución, revisión y tipo de comando U31. Tanto progreso como completado U31 son válidos; un cambio legacy de fecha queda rechazado y se revierte íntegramente.

Esto sigue siendo SQL *staging cerrado*, no probado todavía con dos transacciones reales ni activado en QA/PROD. El rollback elimina ambos triggers y sus funciones sin tocar filas. El gate de ejecución U60 no debe abrirse hasta la prueba E2E transaccional de progresar/completar, intercalando una escritura legacy prohibida.

### Auditoría ampliada de dependencias reales (U60)

El gate read-only ahora también comprueba la cadena V26 completa (cuatro funciones críticas con huellas SHA-256/propietarios/ACL contrastadas en QA), la tabla y el índice de recibos necesarios para el trigger diferido, las **tablas concretas** de los dos triggers, los **destinos de las FK** y la unicidad real de los índices de ocurrencia/ejecución. No basta con que exista un objeto de nombre parecido. En QA todos estos controles son verdaderos; el único bloqueo de reconciliación sigue siendo el ledger 0/7. No se han aplicado SQL ni permisos. La huella de V26 deberá actualizarse y certificarse si futuros cambios legítimos modifican los ejecutores.

### Paridad de estados Cliente y defensa contra horario desincronizado

La proyección de decisión Training360 replica ahora el contrato de estados U33 en sus cuatro fases visibles: confirmado solo con cita confirmada; en curso con confirmada/cancelada; completado y cancelado con los estados históricos compatibles. No se cuenta ni se ofrece como disponible una cita pendiente o una confirmación incoherente. El Coach conserva una vista diagnóstica de esas fechas, sin conceder permisos de escritura. La lectura privada U60 también exige concordancia del inicio, fin, zona y fecha/hora local de Santiago entre la ocurrencia y su cita. Todo sigue cerrado, pendiente de E2E QA autenticado.

### Recuperación y métricas diferenciadas por rol

Una ocurrencia completada sin ejecución espejo verificada se registra como evidencia insuficiente, **no como 0 % de adherencia**. Coach recibe una acción de comprobación de integridad; Cliente no recibe alarmas de infraestructura ni un porcentaje engañoso. Los estados de la cita y los fallos de integridad se mantienen como responsabilidad operativa del Coach/Admin.
