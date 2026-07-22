# IBERFIT M26

Repositorio oficial preparado para **App Cliente** y **App Coach** de IBERFIT.

Versión vigente del repositorio: **RC29 · Prepublicación e infraestructura controlada** (`26.0.0-prepublicacion-infraestructura.29`).

La aplicación funcional permanece basada en el cierre local RC28. RC29 no modifica la experiencia visible: corrige y endurece el repositorio, la comparación remota de 52 comandos, los preflight de Supabase, la configuración del canario y la automatización de integración continua.

## Validación local

```bash
npm run validate:rc29
```

La validación local no equivale a aprobación de producción. Los gates de Supabase, cuentas QA, dispositivos físicos, canario y rollback siguen siendo obligatorios.

## Política de publicación

- No se hacen commits directos a `main`.
- El repositorio de la aplicación debe ser privado y separado de `iberfit.cl`.
- `iberfit.cl`, `app.iberfit.cl` y `coach.iberfit.cl` no se modifican desde una rama sin aprobar.
- M25.1 permanece como rollback inmutable y M25.2 como baseline protegido.
- La Inteligencia IBERFIT propone; el entrenador revisa y decide.
- Los flujos sensibles fallan cerrados.
- Las 52 definiciones remotas deben coincidir exactamente antes de habilitar el canario.
- Ninguna credencial de servicio, contraseña QA ni dato real de cliente se incorpora al repositorio.
