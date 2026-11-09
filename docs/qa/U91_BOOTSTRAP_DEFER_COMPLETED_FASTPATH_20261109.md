# IBERFIT U91 — bootstrap Cliente QA sin procesar bloques descartados

SHA fuente QA `d1ecdc751a5ba5b17bb9a219756e0e48`; candidato `6e738331104794833987e82b6b6d105f`. Sin cambios de roles, permisos, RLS, estado, ni datos en tablas.

La función v26_rc29 proyectaba todos los `blocks` de una sesión completada antes de sobrescribirlos con `[]` en la respuesta resumida. La transformación U91 sustituye los `blocks` por `[]` **en la entrada del proyector M43** y pasa el resultado por el mismo sanitizador. La carga a demanda sigue recuperando el historial íntegro para el titular autorizado. No se permite desactivar el sanitizador ni el control de propietario.

## Evidencia previa exacta

- 612 entidades `session` completadas, 1.335 bloques bajo datos QA al medir.
- Misma salida JSONB para 612/612 casos, sin diferencias ni en la semántica de bloques.
- Plan aislado anterior: 645,29 ms; candidato: 119,62 ms; reducción ~81,5% en esa subconsulta. No equivale al tiempo completo de bootstrap ni al p95 bajo concurrencia.
- Comprobación posterior exigida: Cliente A, Cliente B, Coach, Admin contra **la función original en la misma transacción**; permisos y firma; E2E M43 real; registro de HTTP 500/SQLSTATE 57014; rollback preparado.
- Producción NO recibe esta rama QA condicional: PROD no activa `free_client_completed_history_demand_qa`, por lo que U91 no representa una migración aplicable al entorno real.

## Controles innegociables

Conservar la validación fail-closed, no añadir reintentos a escrituras, no aumentar timeouts para tapar el fallo, no relajar WebAuthn ni controles de publicación, no borrar historial. Todo P0 abierto bloquea la promoción.
