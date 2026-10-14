# IBERFIT NEXT M41 · Psicología de uso, referencias comparadas y decisiones

**Fecha:** 14 de octubre de 2026. **Alcance:** M41 visual y sus dependencias M42/M44. **Método:** contraste de documentación actual, investigación de usabilidad y pantallas públicas con el código fuente real de Cliente, Coach y Admin. No se declara haber realizado entrevistas ni experimentos propios con usuarios.

## Referencias verificadas y transferencia selectiva

| Evidencia | Aprendizaje comprobable | Decisión adaptada a IBERFIT | Lo que rechazamos |
|---|---|---|---|
| Nielsen Norman Group, *The Aesthetic-Usability Effect* (rev. 2026-09-01) https://www.nngroup.com/articles/aesthetic-usability-effect/ | La buena estética puede mejorar la percepción de uso y enmascarar problemas objetivos | Evaluar flujos reales y métricas de tarea además de fotografías; diseños sobrios sin falsos estímulos | Tratar un screenshot bonito como prueba de eficacia |
| NN/g, *Recognition and Recall* https://www.nngroup.com/articles/recognition-and-recall/ | Etiquetas/contexto visibles reducen esfuerzo de recordar | Dock Cliente con texto legible incluso a 320px; acciones explícitas, ayudas contextualizadas | Navegación con iconos crípticos y tutorial memorístico |
| NN/g, *10 Usability Heuristics* https://www.nngroup.com/articles/ten-usability-heuristics/ | Estado del sistema, control, prevención y recuperación de errores y minimalismo | Visibilidad del estado real; nunca confundir borrador/publicado/ejecutado; feedback con mensaje y recuperación | Confiar en el color sin texto o esconder fallos |
| Apple Human Interface Guidelines, Accessibility / Motion https://developer.apple.com/design/human-interface-guidelines/accessibility/ https://developer.apple.com/design/human-interface-guidelines/motion/ | Objetivos táctiles cómodos, movimiento con finalidad, simplificación cognitiva y respeto de Reduce Motion | Focus visible, 48px Cliente/44px Coach/Admin, no usar blur/transform que entorpezca controles; guía de bienvenida con dock despejado | Animaciones constantes, exceso de parallax, overlays que roban foco |
| Oura Trends, documentación actualizada 2026-10-07 https://support.ouraring.com/hc/en-us/articles/360055983614-Using-Trends | La tendencia se comprende al situarla en un intervalo y en contexto personal | En M44, evolución longitudinal con fechas, fuente, unidades y comparabilidad; IRI inicial separado | Inventar una puntuación de salud o inferencias clínicas a partir de sensores |
| TrainingPeaks Coach User Guide https://help.trainingpeaks.com/hc/en-us/articles/231470308-TrainingPeaks-Coach-User-Guide | Calendario, entrenamiento, perfil, dashboard y alertas al servicio de decisiones de un coach | M42/M45: continuidad entre planificación y ejecución, controles rápidos y excepciones prioritarias | Convertir la vista diaria en una pared de gráficas |
| Hevy Coach Client App https://hevycoach.com/features/client-app/ | Registro sin fricción de series, carga/reps/RPE y descanso; feedback al coach | M43 se preserva, M42 priorizar siguiente acción; no obligar a duplicar registro | Añadir engagement o gamificación irrelevantes |
| Ntoumanis & Moller, SDT and physical activity, 2025, doi:10.1016/j.psychsport.2025.102879 https://www.sciencedirect.com/science/article/pii/S1469029225000780 | La autonomía, competencia y apoyo interpersonal pueden contribuir a actividad física, con efectos modestos/variables | Transparencia del plan, control del propio ritmo, logros sustentados en datos y relación humana sin depender de una persona concreta | Culpa por no cumplir, rachas coercitivas, puntos vacíos o promesas de resultados |

La revisión no afirma superioridad empírica frente a todos los competidores. Necesita pruebas comparativas reales y satisfacción/retención medida, no entusiasmo estético.

## Decisiones M41 implementadas junto al mismo PR (sin microbloques)

1. **Calma psicológica + prioridad:** reducción significativa de gradientes, sombras múltiples y blur en shell, acceso, Coach, Admin, barras y paneles. Un objetivo por superficie, no transformar tarjetas en botones flotantes.
2. **Efecto Zeigarnik controlado:** borradores y tareas pendientes deben distinguirse de lo completado, pero sin recordatorios persistentes de culpa. Las semánticas M43 están preservadas, no reescritas.
3. **Reconocimiento:** etiquetas de dock menos pequeñas y posibilidad de envolver a 320px; etiquetas Coach y pasos Admin accesibles; números alineados para comparar.
4. **Autonomía y control:** la guía inicial se puede pausar y reanudar, no bloquea navegación ni ocupa el espacio de la barra inferior. La separación del nav se calcula con la geometría real al renderizar y con cambios de viewport; ayuda disponible sin secuestrar trabajo.
5. **Confianza:** crema editorial con tintas AA solamente para un momento deliberado; todas las demás islas blancas accidentales siguen fallando. Estados de éxito/error permanecen distintos y comunicados con texto.
6. **Percepción de velocidad:** sin nuevas dependencias/font requests, eliminación de blur/focos decorativos costosos; ningún cambio de fetch, auth, RLS ni persistence. La mejora de CWV deberá medirse, nunca asumirse.

## Candidatos funcionales de M42 — aprobar cuando se implementen y prueben

- **Una pregunta por pantalla:** Cliente «¿Qué toca ahora?» con un CTA auténtico, *solo si hay sesión publicada*, y contexto claro de modalidad.
- **Continuidad visible:** «Última sesión»/«Retomar borrador» en Coach, con confirmación real del guardado y cliente activo siempre visible. Evita errores de persona y pérdida de trabajo.
- **Feedback humano de calidad:** al completar, breve reconocimiento del trabajo concreto (sin confundir sesión parcial y publicada), y próxima sugerencia solo cuando exista plan autorizado.
- **Ayudas situacionales, no invasivas:** una breve indicación cuando hay un objetivo real, nunca una guía que reaparece después de descartarla.
- **Control explícito:** pausa/reanuda, descanso, alternativa, carga, observaciones y comunicación con Coach sin penalización por querer adaptar.

## Candidatos de M44 — informaciones que ayudan a decidir

- Línea de tiempo por ejercicio y cumplimiento con puntos de referencia de fecha, unidad, carga, RPE, revisión y frecuencia; diferenciar evidencia real, dato manual, pendiente y estimación.
- Gráficas legibles con interpretación honesta: ausencia de datos no equivale a regresión, tendencia no es causalidad ni prescripción médica.
- Comparación con límites de muestras, contexto del periodo y explicación de por qué puede revisarse el plan; no cerrar el IRI inicial dentro del progreso.

## Contratos de aceptación y validación de daño

- Cliente: terminar una sesión sin perder foco, 320px y 200% zoom, barra accesible y diálogo Genio que NO tapa destinos.
- Coach: crear/guardar/publicar con confirmación y sin duplicar, 44px, identidad del cliente persistente y acceso posterior a WebAuthn.
- Admin: revisión/acción reversible clara, jerarquía estable, estados por escrito, tablas que conservan legibilidad.
- QA: snapshots sintéticos de los tres roles + journeys realmente autenticados en QA confiable; CSS computado, contraste, touch, sin overflow; ningún verde por eliminar assertions de seguridad.
- M41 no se considerará cerrado hasta Ready/CI completo, merge, Canary real, MFA real si corresponde y promoción/verificación PROD.

**Riesgos particulares observados en CI:** un test Admin antiguo requería gradiente visual aun cuando el sistema lo retiró por calidad; se reemplaza por aserciones de superficies mates reales. Otro test demostró que en móvil la guía podía solapar la navegación fija; el producto se corrige midiendo el dock y asegurando margen en cada vista.

## M41 · Cierre de la superposición táctil de la guía

La inspección de una captura autenticada de tablet identificó un caso ignorado por el antiguo umbral 690 px: en 1024×1366 el dock del Cliente puede seguir visible. La guía ahora mide cualquier dock visible, reserva espacio real más margen de seguridad, elimina la reserva cuando se oculta y limita el alto con scroll propio. La prueba autenticada ya no asume que «móvil» se decide por ancho: comprueba la no intersección siempre que el dock esté visible, incluido tablet, y ejercita un dock artificialmente más alto. El estado, pausa y salida de la guía continúan sin cambios.
