-- RC11 · PLAN DE ROLLBACK. Solo después de una instalación QA confirmada.
-- 1. Deshabilitar primero los ocho command types.
-- 2. Confirmar que no existen operaciones pending/conflict/rejected de esos tipos.
-- 3. Retirar colecciones del bootstrap.
-- 4. Retirar transiciones y filas de registro.
-- 5. Conservar tablas y datos durante la ventana de observación; no hacer DROP inmediato.
-- Este archivo no ejecuta cambios deliberadamente.
select 'RC11_ROLLBACK_REQUIRES_EXPLICIT_QA_APPROVAL' as status;
