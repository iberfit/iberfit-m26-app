# IBERFIT · U61 ultramacrobloque integral consolidado · 2026-11-04

**Base real:** PR único #1273, rama `feat/u60-training360-r50-reconciled-20261104`, base Canary `008d8647356c4f5b36dc86500fb19b4324ce26c4`. Cambios U61 preparados como **una sola integración y un solo ciclo CI**, sin otro WIP. Este documento describe el código en la rama; no atribuye despliegues a Canary ni producción.

## Mejoras implementadas en el mismo lote

1. **Cliente premium y calma:** ningún contador técnico de operaciones se pinta en la topbar del Cliente; los conflictos reales y pendientes siguen disponibles de forma accesible en un disclosure discreto **después de la acción principal**, con el botón de consulta y sin presentar datos inciertos como completados. Coach/Admin retienen su supervisión operativa intacta.
2. **Historial sin fricción:** el control de consulta bajo demanda de historial deja de anteponerse al entrenamiento y aparece como acción secundaria, con carga solo por interacción explícita. Se mantienen cancelación, paginación, abortos, owner-fencing y ahorro de egress.
3. **Connected360 — recuperación automática con límites:** una lectura de sensores fallida puede reintentarse tras 30 s en primer plano, no queda falsamente limitada por la cadencia saludable de 5 min; se evita el polling excesivo y se abortan lecturas antiguas tras logout/cambio de cuenta.
4. **Connected360 — latidos robustos:** el heartbeat nativo no solapa lecturas simultáneas, consume los rechazos asíncronos de forma controlada, respeta el estado visible y no entrega errores de generaciones anteriores a un nuevo Cliente.
5. **Connected360 — autorización real:** la invitación nativa solo considera enlazado el origen si hay una fuente certificada, scopes y una fecha válida de lectura confirmada. Un mero `status=connected`, un permiso solicitado o una importación manual no son suficientes. Se respeta la negativa explícita, y nunca se solicitan permisos desde un temporizador.
6. **Salud y día a día:** el resumen Cliente añade **minutos medios de actividad y entrenamiento** cuando existen valores normalizados y confirmados. Pasos, duración de sueño y FC reposo siguen diferenciados de mediciones en directo. Ausencia no equivale a cero ni se crean juicios clínicos.
7. **Autenticación sin tormentas:** tras fallo transitorio de refresh, se limita durante 15 s el reintento por foco/cambio de visibilidad, pero el evento de reconexión real y una sesión/token diferente pueden recuperarse inmediatamente. No se confunden fallos de cuentas distintas ni se rehidrata la app desde este coordinador.
8. **Identidad y visual profesional:** disclosure, contraste, foco por teclado, objetivos táctiles de 44 px, responsive y safe-area sin brillos, neón ni tarjetas nuevas; paleta IBERFIT respetada.

## Regresión añadida en el lote

Pruebas nuevas en `m26_shell_roles`, `m42_client_today_service_states`, `m26_connected360_foreground_autosync`, `m26_connected360_targeted_recovery_prompt`, `m26_session_foreground_refresh`, `m26_auth_foreground_refresh_owner_lease`, `m26_cliente360_guided_health_session_macro` y `m26_client_history_demand_controller_free`. Abarcan límites de permisos, confirmación de sincronización real, cadencias y reconexión, cambios de cuenta, errores transitorios, superficies Cliente y ausencia de alerta roja, datos faltantes y recuperación bajo demanda. Deben validarse mediante CI exact-SHA y E2E de navegador ANTES de llamar terminado al lote.

## Capacidades del PR U60 ya consolidadas (no se reinician)

Entrenamiento multifecha independiente (sesión = prescripción, ocurrencia = fecha, ejecución = resultado), Builder Coach, batch CAS/idempotencia, lectura privada, protección de legacy writes, registros cifrados IndexedDB, recuperación de ACK, horario/DST Santiago, decisiones Training360 y controles de acceso Cliente/Coach. Las funciones privadas U30–U36 fueron verificadas físicamente en QA pero el historial contiene **0/7** versiones 20261025. No se habilita el runtime U60, no se reejecutan migraciones históricas y no se otorgan grants mientras esa conciliación no esté certificada.

## Lista integral de certificación y activación pendiente

- QA: reparación oficial y reversible del ledger U30–U36, luego instalación U60 cerrada, replay/concurrencia real en dos conexiones, pruebas JWT de propiedad/IDOR, dos fechas/dos ejecuciones y lectura privada.
- Cliente: inicio, pausa, recuperación, finalización, mensaje de éxito y readback con CTA real en Android/iOS/web; no habilitar botón hasta un backend autorizado.
- Coach: duplicación/plantillas, fecha múltiple, publicación sin duplicados, cambios de cita, búsqueda rápida y corrección del mismo Cliente en tablet.
- Admin: control de permisos, cambios, evidencias y auditoría sin acceso lateral accidental.
- Wearables: Health Connect Android con consentimiento OS real, observaciones y actividades sin inventar sensores; probar vuelta de background, reconexión, lectura parcial, revoke y dos dispositivos. Apple HealthKit según disponibilidad nativa efectiva, sin afirmar lectura desde la PWA.
- Diseño: revisar los resultados visuales en 320/390/768/1024/1440 px, touch, safe areas, lectores de pantalla, error/empty/retry y coste de bundle.
- Lanzamiento: preparar M44 cifrado + restauración DB/Storage reciente, y promover por carriles protegidos Canary SHA exacto y PROD separadamente. Los workflows con jobs remotos `skipped` no equivalen a E2E autenticado.

**No hay atajo seguro que permita certificar hoy una función cuya API no está instalada en QA.** Se puede acelerar la integración del código agrupando las pruebas y la publicación, pero no sustituir la evidencia de autorizaciones, integridad, sesiones independientes ni backups.

## U62 · integridad de métricas y fuentes ambiguas (mismo PR, 04/11/2026)

- Training360: una fecha confirmada durante el día de hoy no cuenta como incumplimiento antes de terminar el día; un resultado completado hoy sí puede contar cuando su ejecución está confirmada. Una ejecución todavía en curso o sin mirror deja la adherencia indeterminada en lugar de fabricar un 0. Se conservan recuentos separados y tareas de verificación Coach.
- Idempotencia visual y seguridad: si una misma ocurrencia aparece duplicada con idéntico UUID/revisión pero campos contradictorios, su proyección se excluye por ambigüedad, sin depender del orden de respuesta. La anomalía se reporta como evidencia insuficiente; no altera el registro origen ni concede permisos.
- Connected360: días observados con todas las métricas inválidas o ausentes presentan un estado vacío honesto, sin afirmar mediciones verificadas; un cero real sigue siendo un dato válido.
- Contratos unitarios agregados al paquete U60/U61 para hoy, pasado, ejecución en curso, duplicados adversariales, métricas ausentes y ceros observados. No habilita U60 backend, no toca Supabase, permisos, PWA, ni PROD. Gates exact-SHA exigidos tras el commit.


## U63 · App Intelligence 30/10–04/11: auditoría de pertinencia y vida diaria

El archivo recibido reúne cinco cortes históricos READ-ONLY. Sus SHA son checkpoints de esas fechas, no el estado actual ni evidencia de release. Matriz de decisiones frente al PR único #1273:

- Running U47, primer clic y recorrido Coach→Cliente (#919/#1078): la ejecución QA histórica fue confirmada; mantener pruebas reales de primer clic, ACK, pausa, finalización, recarga y readback. U60 continúa cerrado hasta la reconciliación QA segura.
- PWA escritorio, navegación y Admin WebAuthn: no recuperar candidatos de octubre divergentes ni duplicar la corrección visual R49/R50. Revalidar Device y WebAuthn en HEAD exacto del PR.
- IRI Fotografía (#1262): la carga de etapa oculta y el fallo temporizado son una investigación válida; comprobar WebAuthn real del SHA actual antes de modificar de nuevo controladores. No atribuir HTTP 200 a funcionamiento correcto del DOM.
- Historial bajo demanda, compactación bootstrap SQL y Supabase Free (#1209): conservar las sesiones publicadas en respuesta HTTP final, integridad sesiones+ejecuciones, mínimo egress, sin prefetch. Un descenso de JSON decodificado no demuestra GB facturados ahorrados.
- Datos V47 antiguos, permiso/consentimiento nativo Connected360 (#944/#1255): mantener lectura histórica separada de valores actuales; M44 y permisos certificados antes de abrir la RPC histórica. No inventar conectividad Apple Health desde PWA.
- Informes sin IRI: no perder borradores de seguimiento; diagnóstico inicial IRI y evolución distintos; aprobación profesional basada en evidencia.
- Privacidad y RLS: conservar comprobaciones negativas por rol, no reabrir grants por una captura histórica de 129/129 tablas; revisar SECURITY DEFINER por contrato, no por cifra aislada.

**Funcionalidad nueva incorporada en el mismo WIP U63**: visión unificada de vida diaria en Cliente Hoy, después de la acción principal de entrenamiento. Muestra bienestar autoinformado con escala 0–10 y fecha, movimiento observado de un día específico (pasos, minutos, sueño, deporte) y sesiones confirmadas de los últimos 28 días con tendencia de carga solo si es comparable. Datos actuales frente a anteriores/históricos rotulados explícitamente. Un mismo día con dos fuentes contradictorias NO suma pasos ni elige arbitrariamente una cifra: el dato ambiguo se deja ausente. Cero medido es distinto de sin dato. No hay score clínico, recomendación médica, cambios automáticos de carga, nueva telemetría ni consultas remotas. Doble fence por clientId. Los registros se obtienen de selecciones autorizadas ya disponibles en memoria. Diseño como una sola superficie sobria, responsive, táctil y accesible, sin proliferar tarjetas.

**Pruebas**: 11 casos puros ejecutados localmente (PASS 11/11) antes de subir el lote; una verificación adicional de wiring/origen/no nueva red se añade a CI. No confundir con E2E autenticado ni con despliegue. Próxima integración sigue bloqueada por ledger QA U30–U36 (0/7), gateway U60 ausente, pruebas reales JWT y restauración M44 fresca. No aplicar SQL a PROD desde este PR.
