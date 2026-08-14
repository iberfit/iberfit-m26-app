# RC58.4 â€” Role Surfaces

RC58_4_STATUS=IMPLEMENTED
RC58_4_SHARED_PRODUCT_LANGUAGE=TRUE
RC58_4_BUSINESS_LOGIC_DUPLICATED=FALSE

## Objetivo

Aplicar el mismo Design System IBERFIT con densidad y jerarquÃ­a distintas segÃºn rol, sin crear tres productos separados y sin reescribir los mÃ³dulos funcionales existentes.

## Cliente

CLIENT_SURFACE_DENSITY=CALM
CLIENT_TOUCH_TARGET_MIN_PX=48

Prioridades:

- siguiente acciÃ³n visible;
- progreso comprensible;
- menos ruido;
- mayor respiraciÃ³n visual;
- tarjetas y hero mÃ¡s editoriales;
- navegaciÃ³n mÃ³vil cuidada;
- tranquilidad y confianza.

No se elimina navegaciÃ³n ni funcionalidad para conseguir simplicidad.

## Coach

COACH_SURFACE_DENSITY=PROFESSIONAL
COACH_TOUCH_TARGET_MIN_PX=44

Prioridades:

- contexto del cliente;
- comparaciÃ³n;
- velocidad operativa;
- mÃ¡s informaciÃ³n Ãºtil por pantalla;
- cards y listas mÃ¡s compactas;
- selector de expediente y estado operativo visibles.

La densidad no debe convertir la interfaz en un dashboard genÃ©rico.

## Admin

ADMIN_SURFACE_DENSITY=OPERATIONAL
ADMIN_TOUCH_TARGET_MIN_PX=44

Prioridades:

- visiÃ³n organizacional;
- permisos y estados explÃ­citos;
- tablas y formularios eficientes;
- jerarquÃ­a compacta;
- identidad administrativa mediante el teal ya definido en tokens.

Admin no reutiliza el oro como Ãºnica seÃ±al de rol: usa `color.role.adminAccent` sin romper la identidad IBERFIT.

## Compatibilidad

La capa `role-surfaces.css` se carga despuÃ©s de `primitives.css`.

Solo utiliza el `data-m26-role` que el shell autenticado ya emite.

No modifica:

- routing;
- autorizaciÃ³n;
- queries;
- Supabase;
- storage;
- comandos;
- sesiÃ³n;
- wearables;
- engagement;
- navegaciÃ³n disponible.

No contiene reglas destructivas `display:none` para ocultar funcionalidad por rol.

## Responsive

- desktop >=1180px puede ajustar ancho de sidebar por rol;
- 720â€“1179px preserva el compact-nav histÃ³rico RC39;
- <=900px respeta el shell mÃ³vil existente;
- <=580px reduce densidad sin perder targets tÃ¡ctiles.

## Seguridad

RC58.4 es presentaciÃ³n pura.

Role styling nunca serÃ¡ una frontera de autorizaciÃ³n. Ocultar o mostrar algo mediante CSS no concede ni revoca permisos.

La seguridad sigue dependiendo de autorizaciÃ³n real, RLS/server boundaries y gates del rail SR0+.

## Lanzamiento

El contrato de paridad de `app.iberfit.cl` permanece vigente.

RC58.4 no toca producciÃ³n, canary ni el dominio publicado.

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