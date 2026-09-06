# IBERFIT Product Roadmap

## North Star
IBERFIT debe saber qué tiene que ocurrir después. Cliente, Coach y Admin deben encontrar la siguiente acción correcta sin navegar ni interpretar múltiples pantallas.

## Product principles
- Marca IBERFIT por encima de la persona: criterio, diagnóstico, planificación, control y seguimiento.
- Cada dato debe conducir a una decisión, una acción o una explicación útil.
- Experiencia premium, accesible, rápida y coherente en Cliente, Coach y Admin.
- Una sola fuente de verdad por dominio; no duplicar reglas de negocio en la interfaz.
- Automatización que reduzca trabajo manual sin ocultar el criterio profesional.
- Seguridad y aislamiento QA/PROD fail-closed.
- No regresiones: mejorar sin perder funcionalidad útil existente.

## Roadmap aprobado
1. **Onboarding excelente para los tres roles.** Cliente, Coach y Admin con entrada guiada. Coach: invitación personalizada, correo de bienvenida, activación, perfil, metodología IBERFIT, recorrido, primer cliente, primera planificación, primera sesión y estado `Coach listo`. Admin debe ver invitado/activado/bloqueado/operativo.
2. **Timeline 360 del cliente.** Alta, IRI, objetivos, plan, sesiones, cambios de carga, feedback, molestias, reevaluaciones, composición corporal, hitos y mensajes relevantes en una sola historia cronológica.
3. **IRI como producto premium.** Comparaciones, tendencias, fortalezas, limitaciones, objetivos sugeridos, prioridades del plan, informe automático premium e IRI Evolution.
4. **Progress Hub.** Fuerza, adherencia, volumen, regularidad, movilidad, bienestar, composición corporal, IRI, récords, streaks y objetivos.
5. **Plan de entrenamiento extraordinario.** Objetivo semanal, foco, carga prevista, ejercicios, alternativas, progresión y explicación breve del coach.
6. **Feedback de sesión inteligente.** Esfuerzo, molestias, dificultad, energía y sensaciones que alimenten decisiones del Coach Action Center.
7. **Comunicación integrada y automatizada.** Bienvenida, recordatorios, sesión completada, récords, ausencias, reevaluación, cumpleaños, renovación y mensajes del coach mediante el canal adecuado.
8. **Retention Engine / Health Score.** Detectar riesgo de abandono con adherencia, actividad, feedback, cancelaciones, evolución y renovación; verde/amarillo/rojo con acciones concretas.
9. **CRM comercial.** Lead, origen, contacto, IRI agendado, asistencia, propuesta, conversión, onboarding y renovación.
10. **Pagos, planes y renovaciones.** Modalidad, tarifa, sesiones contratadas/utilizadas, vencimiento, deuda, congelación, upgrade/downgrade, MRR, churn y ticket promedio.
11. **Admin Command Center.** Coaches, clientes, carga, agenda, cumplimiento, incidencias, retención, rendimiento y actividad, con navegación directa desde señal a acción.
12. **Coach Performance.** Clientes activos, adherencia, planificación pendiente, feedback sin revisar, reevaluaciones, retención y carga, orientado a calidad y soporte.
13. **Centro de notificaciones inteligente.** Requiere acción / importante / informativo, evitando ruido y badges indiscriminados.
14. **Estados vacíos excelentes.** Explicar el siguiente paso y permitir ejecutarlo desde el mismo estado vacío.
15. **Búsqueda global.** Encontrar clientes, coaches, sesiones, planes, tareas y señales rápidamente.
16. **Sistema de objetivos.** Objetivo principal/secundarios, fecha esperada, progreso y evidencia conectada a la planificación.
17. **Hitos y celebración.** Primera sesión, sesiones acumuladas, récords, adherencia, IRI, antigüedad y objetivos alcanzados con lenguaje adulto y premium.
18. **Informes automáticos periódicos.** IRI, post-sesión, mensual, reevaluación, trimestral y `Year in IBERFIT`, con datos reales y espacio para comentario del coach.
19. **Personalización controlada por marca.** El coach añade criterio y recomendaciones sin romper el estándar visual, metodológico ni de datos de IBERFIT.
20. **Inteligencia transversal accionable.** Resumir evolución, detectar anomalías, sugerir revisiones, preparar briefing, generar borradores, identificar riesgo y priorizar lo que requiere atención.

## Secuencia prioritaria
1. Coach Launch Journey
2. Client Timeline 360
3. Progress Hub
4. Retention / Health Score
5. CRM + renovaciones
6. Informes automáticos premium
7. Admin Executive Dashboard
8. Inteligencia predictiva

## Bloque activo: Coach Launch Journey
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
