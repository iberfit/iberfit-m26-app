# IBERFIT â€” Launch parity contract for app.iberfit.cl

FINAL_APP_LAUNCH_DOMAIN=app.iberfit.cl
CURRENT_APP_IBERFIT_CL_PRESERVE_UNTIL_CONTROLLED_CUTOVER=TRUE
CANARY_OR_LEGACY_SURFACES_DELETE_BEFORE_PARITY=FALSE
FUNCTIONAL_PARITY_REQUIRED_BEFORE_CUTOVER=TRUE
ROLLBACK_REQUIRED_BEFORE_CUTOVER=TRUE

## Regla

La nueva IBERFIT no reemplaza la aplicaciÃ³n publicada por ser mÃ¡s reciente.

Debe consolidar lo mejor de:

1. la superficie actualmente publicada en `app.iberfit.cl`;
2. las capacidades histÃ³ricas/canary que sigan aportando valor;
3. M26 Cliente;
4. M26 Coach;
5. M26 Admin;
6. Android/Wear y dispositivos;
7. nuevas capacidades RC58â€“RC64.

Nada Ãºtil se retira por accidente.

## Matriz obligatoria previa a lanzamiento

Cada flujo conocido deberÃ¡ clasificarse como:

- `PRESERVE_AS_IS`
- `PRESERVE_AND_IMPROVE`
- `MERGED_INTO_BETTER_FLOW`
- `INTENTIONALLY_RETIRED`

`INTENTIONALLY_RETIRED` requiere razÃ³n, evidencia de que no rompe operaciÃ³n y aprobaciÃ³n explÃ­cita de release.

La matriz debe cubrir como mÃ­nimo:

- autenticaciÃ³n;
- Inicio/Hoy;
- planificaciÃ³n/semana;
- sesiÃ³n;
- progreso/proceso;
- actividad;
- comunicaciÃ³n/canal;
- expediente;
- IRI;
- informes;
- biblioteca;
- engagement;
- wearables/live HR;
- Admin;
- offline/sync;
- permisos y seguridad.

## Cutover

Antes de apuntar `app.iberfit.cl` a la aplicaciÃ³n consolidada:

1. inventario read-only de superficies actuales;
2. matriz de paridad;
3. backup/snapshot del artefacto anterior;
4. build candidato reproducible;
5. QA Cliente/Coach/Admin;
6. pruebas mÃ³viles/desktop;
7. seguridad y RLS negative tests;
8. smoke de dominio candidato;
9. rollback verificado;
10. cutover;
11. smoke posterior;
12. observaciÃ³n y rollback inmediato si falla un gate.

RC58â€“RC64 no realizan el cutover por accidente.

NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY