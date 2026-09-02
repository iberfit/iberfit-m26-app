# IBERFIT M26 · Final Production Runbook

Status: **convergencia de producción · fail-closed**. Este documento no autoriza ni realiza mutaciones en producción.

## Release certificado

- Release SHA: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`
- Canary branch: `canary/rc74-4`
- Promotion branch: `prep/final-production-rc74-4`
- Production Supabase project ref: `pjhmrhejsoofmouedavw`
- Canary remote gate exacto: run `33641163059` · `success`
- Production SQL bundle histórico: run `33656032685`
- SQL artifact: `final-production-promotion-sql`
- SQL SHA-256: `30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db`
- SQL artifact ZIP digest: `sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2`

## Estado productivo comprobado en modo read-only · 2026-09-02

El proyecto Supabase de producción `pjhmrhejsoofmouedavw` fue leído sin mutaciones y está `ACTIVE_HEALTHY`.

El preflight del bundle SQL histórico se ejecutó dentro de una transacción `READ ONLY` y falló de forma segura con:

`FINAL_PROD_PREFLIGHT_PRE_4C_ROLE_DRIFT:9`

La lectura focal de esos nueve contratos demostró que producción ya contiene exactamente el postestado RC74.4C de least privilege que el bundle pretendía aplicar. No se revirtió ni modificó nada.

La historia de migraciones productiva confirma que la secuencia de producción RC74.4/RC65/P0 ya fue aplicada, comenzando por:

- `20260831163404 final_prod_01_rc74_4_least_privilege`

continuando por los puertos RC74.4, WebAuthn RC65 y P0, y llegando al menos hasta:

- `20260902033214 p0_restore_primary_auth_read_bootstrap_v1`

Por tanto, el artifact SQL del run `33656032685` parte de un baseline anterior al estado productivo real y queda **SUPERSEDED**. No debe ejecutarse, ni siquiera con una confirmación explícita antigua.

`scripts/final_production_sql_execute.ps1` queda retirado como ejecutor mutante: conserva los pins de evidencia, verifica las refs del release y el artifact histórico, pero bloquea cualquier `-Apply` y reporta `ProductionMutations=0`.

## Regla de base de datos desde este checkpoint

- **NO ejecutar** `FINAL_PRODUCTION_PROMOTION.sql` del run `33656032685`.
- **NO restaurar** roles al baseline pre-RC74.4 para hacer pasar el preflight.
- **NO repetir** migraciones ya registradas.
- Cualquier futuro cambio de base de datos debe partir del **estado productivo live actual**, generar únicamente el delta faltante y volver a pasar por QA/Canary antes de una mutación productiva.

El checkpoint de backup/PITR sólo vuelve a ser obligatorio inmediatamente antes de una futura mutación real de base de datos. No es requisito para las lecturas actuales.

## Edge Function WebAuthn productiva

Lectura productiva actual:

- slug: `iberfit-webauthn-v1`
- status: `ACTIVE`
- version: `1`
- `verify_jwt=true`
- RP ID: `iberfit.cl`
- orígenes permitidos visibles: `https://app.iberfit.cl` y `https://coach.iberfit.cl`
- contrato visible: `final-production-free-webauthn-v1`

La fuente live observada corresponde al mismo contrato de producción que la fuente del release certificado. No se debe redeployar esta función por rutina. Una mutación futura requerirá comprobar necesidad real, registrar la versión/deployment vigente y disponer de rollback independiente.

## Frontend de producción · bloqueo actual

`IBERFIT Final Production Frontend` valida correctamente la superficie construida desde el SHA certificado, pero no despliega.

Antes de cualquier mutación frontend hay que recuperar de evidencia real de Cloudflare:

1. proyecto Pages productivo exacto que sirve `app.iberfit.cl`/superficie productiva;
2. deployment ID actualmente live;
3. configuración efectiva de dominios/rutas;
4. mecanismo de rollback al deployment anterior.

No inferir el proyecto productivo a partir del nombre del repositorio, ramas históricas o proyectos Canary. El conector disponible en ChatGPT no expone Cloudflare, por lo que este checkpoint debe venir del proveedor o de evidencia verificable de un deploy real.

La web pública `app.iberfit.cl` responde actualmente con la superficie IBERFIT de acceso restringido. Esto confirma disponibilidad pública, pero **no sustituye** el deployment ID de Cloudflare.

## Siguiente promoción frontend

Cuando el proyecto y deployment actuales estén verificados:

1. volver a comprobar que `canary/rc74-4` sigue exactamente en `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`;
2. construir exclusivamente desde ese SHA;
3. generar runtime con `projectRef=pjhmrhejsoofmouedavw`, `qaOnly=false` y sin material `service_role`;
4. validar headers, `version.json`, orígenes productivos y ausencia del ref QA/hostname Canary;
5. desplegar únicamente al proyecto Cloudflare productivo confirmado;
6. verificar live SHA/runtime antes de continuar con autenticación y aislamiento;
7. ante fallo, restaurar el deployment ID productivo registrado antes del cambio.

Ninguno de estos pasos autoriza por sí solo una mutación. El despliegue a producción requiere aprobación explícita.

## Post-launch obligatorio

Después de un futuro despliegue frontend aprobado, verificar en este orden:

1. SHA/version/runtime productivos;
2. acceso anónimo apropiadamente limitado;
3. aislamiento Client A / Client B;
4. Coach/Admin fail-closed antes de WebAuthn y acceso sólo tras assurance verificada;
5. creación canónica de cliente con superficie legacy revocada;
6. registry de 52 comandos y reglas críticas de conflicto/locks;
7. ausencia de datos cruzados, notas privadas, secretos o credenciales privilegiadas en navegador/offline storage;
8. coherencia entre frontend live, Edge Function live y estado actual de base de datos.

Cualquier divulgación cross-client o regresión de seguridad bloquea el release y obliga a rollback/contención.

## Evidencia

Guardar únicamente metadatos no secretos: SHA, IDs de runs/artifacts/deployments, versiones, timestamps, conclusiones y errores redactados. Nunca guardar contraseñas, JWT, service-role keys, notas privadas, exportaciones de clientes ni snapshots productivos en GitHub.
