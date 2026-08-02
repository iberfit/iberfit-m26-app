# RC40 · Matriz QA extremo a extremo

## Aplicaciones y roles

- Carlos puede elegir Coach o Admin y nunca una aplicación no autorizada.
- Cambiar de aplicación limpia cliente seleccionado, permisos de vista y estado incompatible.
- Admin solo puede abrir rutas `admin-*`.
- Cliente nunca ve usuarios, roles, leads, tareas, auditoría o configuración.
- Coach solo ve clientes asignados cuando el alcance de asignación está activado.

## Admin

- Inicio muestra datos backend, nunca fixtures.
- Usuarios cambia estado y roles con motivo, ACK y auditoría.
- El último Admin y el Admin actual quedan protegidos.
- Equipo crea/finaliza asignaciones y abre la conversación Cliente–Coach.
- CRM registra leads y su siguiente acción.
- Ciclo de vida no altera el expediente profesional.
- Agenda global conserva la fuente de verdad existente.
- Operaciones crea y resuelve incidencias.
- Comunicación administra plantillas; no envía sin una acción o regla explícita.
- Automatizaciones solo crean notificaciones o tareas, nunca decisiones profesionales.
- Analítica conserva ausencia como «Sin datos».
- Auditoría no incluye tokens, contraseñas, notas privadas ni datos de salud innecesarios.

## Mensajería

- Coach solo abre hilos para clientes visibles/asignados.
- Cliente solo ve sus propios hilos.
- Mensajes requieren conexión y ACK.
- El mensaje genera una notificación para la contraparte.
- Marcar leído no modifica mensajes ajenos.

## Fallos

- Sin RPC v14, Cliente y Coach siguen funcionando y Admin/Mensajes muestran indisponibilidad segura.
- Sin conexión, ninguna mutación sensible se encola.
- operationId duplicado devuelve el mismo resultado; una colisión se rechaza.
- Conflicto de revisión no se muestra como éxito.

## Dispositivos

- 320×568, 390×844 y 430×932.
- 768×1024 y 1024×768.
- 1366×768, 1440×900 y 1920×1080.
- Zoom 400 %, texto 200 %, teclado, foco y lector de pantalla.
