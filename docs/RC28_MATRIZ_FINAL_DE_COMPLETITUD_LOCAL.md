# RC28 · Matriz final de completitud local

| Área | Estado local | Evidencia local | Requiere infraestructura real |
|---|---|---|---|
| Acceso y sesión | Completado localmente | login simulado, reanudación, error y cierre con reset total | autenticación Supabase real, expiración y revocación |
| Separación Coach/Cliente | Completado localmente | navegación, comandos, ViewModel y payload proyectado por rol | RLS, RPC y captura de payload HTTP real |
| Aislamiento entre clientes | Completado localmente | filtros exactos, fuzz y pruebas de cruces | intentos directos con dos cuentas Cliente reales |
| Identidad y cambio de usuario | Completado localmente | reset de ruta, selección, operaciones y confirmaciones | cambio real de cuenta/dispositivo |
| Hoy Cliente | Completado localmente | estados con datos y vacíos | datos y agenda reales |
| Hoy Coach | Completado localmente | cartera y prioridades simuladas | carga real y concurrencia multiusuario |
| Clientes Coach | Completado localmente | búsqueda con/sin tildes y cartera amplia | permisos reales de cartera |
| Expediente | Completado localmente | contexto, acceso y navegación | lectura/escritura remota real |
| Diagnóstico IRI | Completado localmente | validación metodológica, edad, sexo y trazabilidad | persistencia y concurrencia reales |
| Planificación | Completado localmente | validar, aprobar, previsualizar, publicar y retirar | RPC y auditoría remota |
| Sesiones | Completado localmente | constructor, catálogo, grupos, publicación y selección exacta | persistencia real, dispositivos y redes variables |
| Ejecución guiada | Completado localmente | series, retroceso, pausa, descanso, feedback y cierre | uso físico sostenido y recuperación tras cierre del sistema |
| Agenda | Completado localmente | creación/cancelación y validaciones | calendario y zona horaria reales |
| Progreso | Completado localmente | adherencia, RPE, volumen, IRI y estados sin datos | historiales reales amplios |
| Actividad y hábitos | Completado localmente | check-in, hábitos, ausencias y operaciones pendientes | sincronización remota real |
| Informes | Completado localmente | edición, aprobación, vista Cliente exacta y publicación | generación/almacenamiento remoto y descarga real |
| Notas privadas | Completado localmente | solo Coach, sin exposición al Cliente | RLS y API real |
| Inteligencia IBERFIT | Completado localmente | propuesta desde datos confirmados y revisión Coach | latencia/servicio opcional real y política operacional |
| Biblioteca | Completado localmente | 367 ejercicios localizados y buscables | producción de medios premium pendientes por contenido |
| Wearables gratuitos | Preparación local completada | importación local y contratos Health Connect/Google | puente nativo, OAuth, revisión y dispositivo |
| Offline y reintentos | Completado localmente | cola, propiedad, backoff, conflictos y deduplicación | pérdida de red real y actualización PWA instalada |
| Accesibilidad | Completado localmente en automatización | foco, etiquetas, 44 px, lectores y reducción de movimiento | lectores de pantalla y usuarios reales |
| Castellano | Completado localmente | gate automático sobre texto y atributos visibles | revisión editorial final con usuarios españoles |
| Rendimiento | Completado localmente dentro del presupuesto | build, DOM, historiales amplios y tiempos Chromium | medición en móviles físicos de gama media/baja |
| PWA | Completado localmente | manifest, caché y política de no cachear mutaciones | instalación y actualización real |
| Seguridad de cabeceras | Completado localmente | CSP, X-Frame-Options y ausencia de secretos | cabeceras efectivas de Cloudflare |
| Canario | No ejecutado | paquete web preparado | **Sí: despliegue controlado** |
| Rollback | No ejecutado | M25.1 preservado y runbook escrito | **Sí: ensayo real** |

## Conclusión

No se identifica una mejora funcional local relevante pendiente que justifique retrasar el inicio de la fase de infraestructura. Las mejoras posteriores serán ajustes derivados de datos reales, dispositivos, accesibilidad humana o observación del canario.
