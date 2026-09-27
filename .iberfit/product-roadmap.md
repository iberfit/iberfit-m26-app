# IBERFIT Product Roadmap

> Dirección de producto aprobada en profundidad: [`product-blueprint-closed-loop-2026-09.md`](./product-blueprint-closed-loop-2026-09.md). Ante cualquier ambigüedad, ese blueprint amplía este roadmap sin degradar sus capacidades útiles.

## North Star
IBERFIT debe saber qué tiene que ocurrir después. Cliente, Coach y Admin deben encontrar la siguiente acción correcta sin navegar ni interpretar múltiples pantallas.

IBERFIT evoluciona hacia un **sistema operativo del entrenamiento personal** con circuito cerrado:

**Diagnóstico inicial → objetivos → planificación → prescripción → ejecución → datos reales → feedback → interpretación → decisión profesional → adaptación → evolución.**

## Product principles
- Marca IBERFIT por encima de la persona: criterio, diagnóstico, planificación, control y seguimiento.
- Cada dato debe conducir a una decisión, una acción o una explicación útil.
- Experiencia premium, accesible, rápida y coherente en Cliente, Coach y Admin.
- Una sola fuente de verdad por dominio; no duplicar reglas de negocio en la interfaz.
- Automatización que reduzca trabajo manual sin ocultar el criterio profesional.
- Seguridad y aislamiento QA/PROD fail-closed.
- No regresiones: mejorar sin perder funcionalidad útil existente.
- IRI representa el punto de partida; seguimiento, reevaluación y evolución representan el progreso posterior y no se mezclan conceptualmente.
- La IA prepara decisiones y reduce fricción; no sustituye el criterio profesional.
- Wearables y sensores complementan el feedback humano; no lo sustituyen.
- El histórico de prescripción y ejecución debe permanecer fiable, versionado e inmutable.

## Roadmap aprobado
1. **Onboarding excelente para los tres roles.** Cliente, Coach y Admin con entrada guiada. Coach: invitación personalizada, correo de bienvenida, activación, perfil, metodología IBERFIT, recorrido, primer cliente, primera planificación, primera sesión y estado `Coach listo`. Admin debe ver invitado/activado/bloqueado/operativo.
2. **Timeline 360 del cliente.** Alta, IRI, objetivos, plan, sesiones, cambios de carga, feedback, molestias, reevaluaciones, composición corporal, hitos y mensajes relevantes en una sola historia cronológica.
3. **IRI como producto premium.** Comparaciones, fortalezas, limitaciones, objetivos sugeridos, prioridades del plan e informe automático premium. Las mediciones posteriores pertenecen a `Evolución / Reevaluación`, no a un “IRI Evolution” indiferenciado.
4. **Ejecución fiable y Planned vs Actual.** Prescripción versionada, snapshots históricos, ejecución offline-first, comparación planificado/real y recuperación ante conectividad deficiente.
5. **Motor de entrenamiento extraordinario.** Fuerza, running estructurado, circuitos, variantes, progresiones, regresiones, alternativas, descansos y contexto histórico.
6. **Cliente Hoy + modo entrenamiento.** Siguiente acción inequívoca y superficie de ejecución ultrarrápida en móvil.
7. **Coach Session Cockpit.** Registro presencial de alta velocidad, histórico inmediato y acciones táctiles directas.
8. **Feedback de sesión inteligente.** Esfuerzo, molestias, dificultad, energía y sensaciones que alimentan decisiones del Coach Action Center.
9. **Connected Health real.** Apple Health/HealthKit, Health Connect, Samsung, Wear OS, Garmin, Strava, Fitbit, Oura y proveedores futuros bajo consentimiento, mínimo privilegio y deduplicación.
10. **Workout delivery.** Envío de prescripciones estructuradas a Apple Watch/Garmin cuando la integración oficial lo permita.
11. **Progress Hub accionable.** Fuerza, adherencia, regularidad, running, bienestar, composición corporal, reevaluaciones, récords y objetivos con contexto interpretable.
12. **Coach Action Center.** Señales explicables procedentes de sesiones, feedback, adherencia, dolor, objetivos, calendario, running, wearables, IRI y reevaluaciones, enlazadas directamente a acciones.
13. **Comunicación integrada y contextual.** Bienvenida, recordatorios, sesión completada, récords, ausencias, reevaluación, cumpleaños, renovación y mensajes del coach asociados al contexto adecuado.
14. **Perfiles Cliente-Coach.** Foto segura, identidad humana, modalidad, coach, objetivo y perfil profesional sin convertirse en red social.
15. **Sistema de objetivos.** Objetivo principal/secundarios, fecha esperada, baseline, progreso y evidencia conectada a la planificación.
16. **Informes automáticos periódicos.** IRI, post-sesión, mensual, reevaluación, trimestral y `Year in IBERFIT`, con datos reales y espacio para comentario del coach.
17. **Admin Command Center.** Personas, operación, calidad, seguridad, integraciones, incidencias, retención, rendimiento y actividad con navegación directa señal → acción.
18. **Retention Engine explicable.** Detectar riesgo con adherencia, actividad, feedback, cancelaciones, evolución y renovación, evitando scores opacos como superficie principal.
19. **CRM comercial.** Lead, origen, contacto, IRI agendado, asistencia, propuesta, conversión, onboarding y renovación.
20. **Pagos, planes y renovaciones.** Modalidad, tarifa, sesiones contratadas/utilizadas, vencimiento, deuda, congelación, upgrade/downgrade, MRR, churn y ticket promedio.
21. **Coach Performance.** Clientes activos, adherencia, planificación pendiente, feedback sin revisar, reevaluaciones, retención y carga, orientado a calidad y soporte.
22. **Centro de notificaciones inteligente.** Requiere acción / importante / informativo, evitando ruido y badges indiscriminados.
23. **Estados vacíos excelentes.** Explicar el siguiente paso y permitir ejecutarlo desde el mismo estado vacío.
24. **Búsqueda global.** Encontrar clientes, coaches, sesiones, planes, tareas y señales rápidamente.
25. **Hitos y celebración.** Primera sesión, sesiones acumuladas, récords, adherencia, reevaluaciones, antigüedad y objetivos alcanzados con lenguaje adulto y premium.
26. **Personalización controlada por marca.** El coach añade criterio y recomendaciones sin romper el estándar visual, metodológico ni de datos de IBERFIT.
27. **Inteligencia transversal accionable.** Resumir evolución, detectar anomalías, sugerir revisiones, preparar briefing, generar borradores, identificar riesgo y priorizar lo que requiere atención.
28. **Vídeo técnico contextual.** Captura/subida por parte del Cliente, cola de revisión del Coach, comentarios vinculados a ejercicio/sesión y política estricta de privacidad/retención.
29. **Biblioteca de ejercicios como conocimiento.** Patrones, equipamiento, progresiones, regresiones, alternativas, cues, errores frecuentes y variantes gobernadas por Admin.
30. **Observabilidad de integraciones.** Estado por proveedor, última sincronización, reintentos y errores seguros sin secretos ni tokens.

## Secuencia prioritaria

### Fundacional
1. Ejecución fiable/offline.
2. Planned vs Actual + snapshots históricos.
3. Modelo fuerza/running.

### Alta
4. Perfiles/foto Cliente-Coach.
5. Coach Session Cockpit.
6. Cliente `Hoy`.
7. Running estructurado.
8. Connected Health real.
9. Apple Watch/Garmin workout delivery.
10. Progress Hub accionable.
11. Coach Action Center.

### Escala de negocio y producto
12. CRM + renovaciones + pagos.
13. Retention Engine explicable.
14. Informes automáticos premium.
15. Admin Executive/Command Center.
16. Inteligencia transversal más profunda.

## Bloque activo histórico: Coach Launch Journey
### Objetivo
Llevar a un Coach desde la invitación hasta estar operativo para atender clientes, sin tutoriales frágiles ni estados inventados.

### Hitos de producto
- Invitación y bienvenida específica para Coach sobre la infraestructura Auth existente.
- Activación y primer acceso con orientación contextual.
- Perfil operativo.
- Primer cliente asignado.
- Primera planificación preparada.
- Primera sesión realizada.
- Estado final `Coach listo`.
- Progreso reanudable derivado de hechos reales siempre que exista evidencia de dominio.
- Admin ve el mismo estado de preparación dentro de Coach 360.
- Descubrimiento progresivo de la app y estados vacíos con siguiente acción clara.
- Accesibilidad y traducciones ES/EN/FR/PT en superficies de aplicación.

### Guardrails
- `user_metadata` puede personalizar correo/onboarding, nunca autorizar roles.
- No ampliar permisos para construir Coach 360.
- No inventar estado de planificación o sesión si el payload actual no lo prueba.
- No introducir un segundo motor de prioridad paralelo al Coach Action Center.
- Mantener el trabajo de `feat/m26-exercise-media-catalog-20260905` fuera de este bloque.
- Cualquier implementación nueva debe conservar el blueprint aprobado y pasar WIP=1 → test → CI → Canary → verificación real antes de producción.
