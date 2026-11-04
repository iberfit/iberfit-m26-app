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
