# IBERFIT M26 · Matriz vinculante de cobertura de producto · RC8

Cada capacidad requiere interfaz real, permiso por rol, lectura o comando canónico, estados loading/empty/success/error/retry, accesibilidad y prueba automatizada. “Núcleo funcional” no equivale a “listo para producción”.

| Capacidad auditada | Estado RC8 | Cobertura incorporada | Pendiente obligatorio antes del lanzamiento |
|---|---|---|---|
| Constructor visual | Núcleo funcional reforzado | Catálogo, ejercicios, biseries, triseries, circuitos, AMRAP, Tabata, validación y publicación | Reordenación accesible, edición completa de prescripción y QA E2E |
| Biblioteca integral | Operativa | 367 ejercicios únicos, búsqueda, filtros, selección y sustitución sin texto libre | Revisar imágenes/instrucciones de los 367 y completar metadatos faltantes |
| IA de sesiones | Motor supervisado | Objetivo, modalidad, edad, restricciones, equipo, duración, experiencia y alternativas | Mejorar periodización, historial de carga, fatiga, adherencia y evaluación deportiva |
| Sesión guiada | Núcleo funcional reforzado | Inicio remoto, resultados por serie, RPE/RIR, descanso, avance/retroceso, sustitución, pausa, reanudación, cancelación y feedback | Temporizador persistente, recuperación tras cierre, QA real y audio/háptica opcional |
| Agenda y reservas | Workflow alineado | Crear, reprogramar y cancelar con contrato canónico | Vista calendario completa, disponibilidad, recordatorios y QA por rol |
| Formularios reanudables | Base disponible | Draft store separado del estado confirmado | Autosave visible, recuperación tras cierre y control de versiones en cada formulario |
| PWA/offline | Shell seguro incorporado | Manifest, iconos reales, service worker versionado, fallback y exclusión de Auth/RPC/REST | QA de instalación/actualización y estrategia offline por pantalla |
| Estados de acción | Incorporados en sesiones | loading, success, error, retry, `aria-busy` y bloqueo durante envío | Aplicarlos de forma uniforme a todos los módulos restantes |
| Auditoría de botones | Incorporada | Tipo, nombre accesible, acción registrada y prohibición de handlers inline | Ejecutar auditoría sobre todas las rutas finales montadas |
| Centro de conflictos | Arquitectura disponible | Pendientes, conflictos y ACK separados | UI de resolución, comparación de revisiones y reintento E2E |
| Check-ins y hábitos | Backlog vinculante | Requisito conservado | Diseño, comandos backend, recordatorios, adherencia y alertas |
| Mensajería contextual | Backlog vinculante | Requisito conservado | Hilo por cliente, adjuntos seguros, notificaciones y RLS |
| Notas privadas Coach | Backlog vinculante | Requisito conservado | Entidad canónica, RLS Coach/Admin y auditoría |
| Progreso y gráficas | Backlog vinculante | Datos IRI y ejecuciones preparados | Gráficas comprensibles, filtros temporales y ausencia ≠ cero |
| Wearables | Posterior al lanzamiento inicial | No bloquea núcleo | Contratos de importación, consentimiento y normalización |
| Accesibilidad/responsive | Estática reforzada | Foco, nombres, controles táctiles ≥44 px y adaptación móvil | Auditoría real con teclado, lector de pantalla y dispositivos |

## Criterio de salida

No se promoverá una candidata mientras exista un botón sin acción, una acción sin permiso, un estado optimista presentado como confirmado, un comando fuera del registro, una ruta sin estados completos o un flujo crítico sin prueba autenticada.
