# IBERFIT RC40 FINAL2 · Sistema integrado Cliente–Coach–Admin

RC40 convierte Admin en una aplicación independiente y completa el núcleo operativo de las tres aplicaciones.

## Incluye

- contexto común de organización, aplicaciones autorizadas y asignaciones;
- restricción de cartera Coach cuando existen asignaciones activas;
- App Admin con centro de control, usuarios, roles, Coaches, asignaciones, CRM, ciclo de vida, agenda global, operaciones, plantillas, automatizaciones, analítica, auditoría y configuración;
- mensajería privada Cliente–Coach y notificaciones in-app;
- mutaciones online-only, idempotencia, ACK, revisión optimista y auditoría;
- estados separados para evitar filtraciones hacia Cliente o Coach;
- funcionamiento fail-closed cuando RPC RC40 no está instalado.

## No incluye

Pagos. Se implementarán al final y exclusivamente en Admin.

## Seguridad

- Admin no hereda las rutas de Coach.
- Cliente no recibe colecciones administrativas.
- Un Coach solo queda restringido por asignaciones cuando el backend ya registra asignaciones para ese Coach; así se conserva compatibilidad durante la transición.
- Suspender membresía bloquea todas las aplicaciones.
- No se puede revocar el propio rol Admin ni suspender la propia cuenta desde el flujo ordinario.
- No se puede revocar el último Admin activo.
- SQL queda preparado, pero el aplicador nunca lo ejecuta.

## Correcciones FINAL2

- Conserva las rutas iniciales usadas por las regresiones RC26/RC27.
- Mantiene intacta la navegación primaria histórica de Cliente y Coach.
- Mensajes se integra como navegación secundaria.
- El controlador de comunicación recibe el store canónico.
- Las regresiones exactas que fallaron se ejecutan antes de la suite completa.
