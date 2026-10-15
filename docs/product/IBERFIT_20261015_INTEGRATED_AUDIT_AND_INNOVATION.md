# IBERFIT — Auditoría operativa + Innovation Radar integrado
Fecha: 15/10/2026. Estado: contrato WIP, sin entrega PROD implícita.

## Estado real y dependencias
- Canary source verificado: SHA 6010f77623b9b69c7d00f40cf9f6a6e91325675b. M44 sigue una rama WIP sin PR ni CI propia.
- P0 #941: la PR #942 corrigió el selector Coach/Admin, recuperación prematura y bloqueo modal. Promotion #38675226516 SUCCESS. Pendiente aceptación **PWA Windows instalada** previamente afectada con identidad multirrol real, sin necesidad de manipular cuenta/MFA. P0 no está cerrado.
- P1 #925: informe y remoto versionado/idempotente; no cerrar sin pruebas reales de dos pestañas, ACK perdido, reintento y publicación posterior.
- P0 seguridad #946: permisos TRUNCATE de anon/authenticated revocados en PROD y verificados. La protección de futuras migraciones y las escrituras de informes están en WIP; no declarar este riesgo totalmente certificado.
- Fuente: auditoría Admin/operación de 15/10 y radar estratégico de 15/10, ambos facilitados por el usuario. Condiciones de proveedor contrastadas también con documentación oficial.

## Puertas de aceptación P0 y M44
1. PWA Windows: Coach/Administrador, elección y reelección, retorno desde background, cierre/reapertura, sesión previa interrumpida; recovery solo después de que el rol esté confirmado por servidor. Admin nunca recupera la sesión Coach por error. No loops, overlays ni pérdida de sesión.
2. Backend: verificación QA de RLS/SECURITY DEFINER, separación Cliente/Coach/Admin, ningún dato interno de informes sin publicar ni metadatos/IDs de borradores en respuesta de bootstrap. Validación positiva de informe publicado legible en Cliente y negativa de acceso de cliente ajeno.
3. Informe: crear borrador en servidor, sello de evidencia, aprobación interna, publicación explícita, estado remoto/versiones, retirada sin borrar historial, reintento idempotente; no usar los preview como prueba de entrega. Sin IRI es válido si existen entrenamientos canónicos confirmados.
4. UX y documento: portada con identidad IBERFIT, resultado y metodología claros, interpretación Coach, comparación válida y no cosmética; PDF con bytes/hash/acceso verificables, paginación sin recortes, lectura móvil/tablet/escritorio, zoom, teclado, contrastes y tabla accesible. Sin mediciones: mostrar falta de datos, no cero.
5. CI: tests unitarios/integración, QA write sintética, seguridad, E2E autenticado, navegador, PWA, canary exacto y promoción PROD con smoke/rollback. No abrir PR M44 ni promover parcialmente antes de superar lo relevante.

## Futuro Continuidad 360: no duplicar motor
**Después de M44/M45**; reutilizar constructor, publicación, ejecución y controles M43. Los imprevistos (menos tiempo, viaje, falta de material) permiten una alternativa solo si está aprobada por el Coach. Conservar originalSessionId, approvedAlternativeId, executedVariantId, duración y equipo autorizados, versión/autor, trabajo mantenido/omitido, motivo y sesión real. **Una alternativa reducida NO es automáticamente equivalente al trabajo originalmente programado** y no convierte una ausencia a cita en asistencia. Mostrar el cambio en Cliente y la decisión en Coach; Admin ve trazabilidad. Piloto de ocho semanas con sesiones verificadas, uso, minutos de reorganización y continuidad; hipótesis, no resultado demostrado.

## Wearables Connected 360: independiente del fabricante
**Tras certificar integración actual y M44/M45.** Fuente por medición: provider, providerRecordId o huella segura, metricType, unit, observedAt, ingestedAt, zona horaria, permisos/consentimiento, frescura, último sync, revisión, dedupe, revocación y error recuperable. Dato obsoleto claramente marcado; datos de reloj NO cuentan como ejecución IBERFIT ni completan citas. Experiencia vincular y listo, sin descargas JSON. Prioridades: pasos, sueño h+min, FC reposo y entrenamientos reales; solo datos autorizados y disponibles.
- Withings: desde 12/10/2026 algunas cuentas nuevas requieren Withings+ en Start for Free; no asumir coste cero.
- Google Health: v4beta 01/10/2026, incorporación de proyectos nuevos restringida; Fitbit Web API se desactiva el 30/10/2026.
- Garmin: acceso sujeto a aprobación real; rumores de suspensión de altas no son garantía oficial.
No hacer a IBERFIT dependiente de un proveedor sin evaluación de acceso/coste/seguridad y pruebas sintéticas de desconexión, duplicados y revocación.

## Experimentos posteriores sin saturar producto
Coach Voice: dictados breves iniciados voluntariamente por Coach, interpretar ejercicio/serie/reps/kg/RPE sin inventar valores, mostrar propuesta editable, confirmar y entonces guardar con el motor actual. No escucha permanente; no voz de clientes sin consentimiento. Métrica piloto: rapidez y errores frente a registro manual, tras su certificación.
Entre Sesiones: microactividad voluntaria y acordada con Coach, no sustituto de fuerza programada, no inferencias clínicas ni notificaciones repetitivas. Evidencia de codiseño todavía preliminar. No construir un módulo completo ahora.

## Decisión final y referencias
No crear PR paralelo P0 #941, no iniciar segundo planificador ni otra integración que duplique Connected 360 o M44. Secuencia: aceptar acceso PWA → certificar M44 → M45/Connected 360 → piloto Continuidad 360 → voz/microactividad si su valor queda demostrado.
Fuentes de proveedor: https://developer.withings.com/ y https://developers.google.com/health/release-notes.
