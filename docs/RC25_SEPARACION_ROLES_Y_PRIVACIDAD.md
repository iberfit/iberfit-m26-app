# RC25 · Separación real por rol y privacidad

## Regla principal
El Cliente no debe recibir datos del Coach para ocultarlos después. El servidor debe devolver únicamente el ámbito autorizado. La proyección local añadida en RC25 es una segunda barrera defensiva, no un sustituto de RLS ni del bootstrap seguro.

## Colecciones nunca entregadas al Cliente
- Notas privadas del entrenador.
- Propuestas y ejecuciones internas de Inteligencia IBERFIT.
- Eventos internos/auditoría.
- Disponibilidad operativa del entrenador.
- Registros técnicos de sincronización wearable.

## Publicación
Sesiones, ciclos e informes solo son visibles cuando están publicados/activos o disponen de `visibleToClient=true`. `visibleToClient=false` siempre prevalece. Borradores, pendientes, aprobados todavía no publicados, retirados, archivados y anulados quedan fuera.

## Cuatro barreras obligatorias
1. Entrada y navegación específicas por rol.
2. Comandos autorizados por rol.
3. Bootstrap minimizado según identidad autenticada.
4. RLS y políticas de escritura en servidor.

## Gates externos pendientes
La garantía completa exige ejecutar `RC25_ROLE_SEPARATION_PREFLIGHT_READONLY.sql` con cuentas QA Coach y Cliente, intentar acceso cruzado directo y verificar que el payload HTTP nunca contiene campos privados.
