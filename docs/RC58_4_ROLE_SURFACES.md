# RC58.4 — Role Surfaces

RC58_4_STATUS=IMPLEMENTED
RC58_4_SHARED_PRODUCT_LANGUAGE=TRUE
RC58_4_BUSINESS_LOGIC_DUPLICATED=FALSE

## Objetivo

Aplicar el mismo Design System IBERFIT con densidad y jerarquía distintas según rol, sin crear tres productos separados y sin reescribir los módulos funcionales existentes.

## Cliente

CLIENT_SURFACE_DENSITY=CALM
CLIENT_TOUCH_TARGET_MIN_PX=48

Prioridades:

- siguiente acción visible;
- progreso comprensible;
- menos ruido;
- mayor respiración visual;
- tarjetas y hero más editoriales;
- navegación móvil cuidada;
- tranquilidad y confianza.

No se elimina navegación ni funcionalidad para conseguir simplicidad.

## Coach

COACH_SURFACE_DENSITY=PROFESSIONAL
COACH_TOUCH_TARGET_MIN_PX=44

Prioridades:

- contexto del cliente;
- comparación;
- velocidad operativa;
- más información útil por pantalla;
- cards y listas más compactas;
- selector de expediente y estado operativo visibles.

La densidad no debe convertir la interfaz en un dashboard genérico.

## Admin

ADMIN_SURFACE_DENSITY=OPERATIONAL
ADMIN_TOUCH_TARGET_MIN_PX=44

Prioridades:

- visión organizacional;
- permisos y estados explícitos;
- tablas y formularios eficientes;
- jerarquía compacta;
- identidad administrativa mediante el teal ya definido en tokens.

Admin no reutiliza el oro como única señal de rol: usa `color.role.adminAccent` sin romper la identidad IBERFIT.

## Compatibilidad

La capa `role-surfaces.css` se carga después de `primitives.css`.

Solo utiliza el `data-m26-role` que el shell autenticado ya emite.

No modifica:

- routing;
- autorización;
- queries;
- Supabase;
- storage;
- comandos;
- sesión;
- wearables;
- engagement;
- navegación disponible.

No contiene reglas destructivas `display:none` para ocultar funcionalidad por rol.

## Responsive

- desktop >=1180px puede ajustar ancho de sidebar por rol;
- 720–1179px preserva el compact-nav histórico RC39;
- <=900px respeta el shell móvil existente;
- <=580px reduce densidad sin perder targets táctiles.

## Seguridad

RC58.4 es presentación pura.

Role styling nunca será una frontera de autorización. Ocultar o mostrar algo mediante CSS no concede ni revoca permisos.

La seguridad sigue dependiendo de autorización real, RLS/server boundaries y gates del rail SR0+.

## Lanzamiento

El contrato de paridad de `app.iberfit.cl` permanece vigente.

RC58.4 no toca producción, canary ni el dominio publicado.

RC58_4_CLIENT_SURFACE=PASS
RC58_4_COACH_SURFACE=PASS
RC58_4_ADMIN_SURFACE=PASS
RC58_4_ROLE_DENSITY=PASS
RC58_4_SHARED_IDENTITY=PASS
RC58_4_NO_FEATURE_HIDING=PASS
RC58_4_NO_NEW_RUNTIME_DEPENDENCIES=PASS

NEXT_ACTION=RC58_5_NATIVE_COMMERCIAL_ALIGNMENT
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY