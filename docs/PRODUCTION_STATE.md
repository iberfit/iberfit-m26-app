# IBERFIT · Production State

Última actualización documental: 2026-09-13
Estado: checkpoint verificable y alineado con producción.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA desplegado: `6d06d033fe09b6802bef21e0f30374b48c78edda`
- Source branch: `canary/rc74-4`
- Promotion workflow: `34776097179 · IBERFIT Production Promotion`
- Resultado: `success`
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD ref: `pjhmrhejsoofmouedavw`

La promoción certificó:
- manifest/source exactos;
- regresión completa;
- build canónico;
- metadata de rollback;
- runtime productivo determinista;
- preflight sobre el mismo proyecto Pages;
- despliegue productivo con Wrangler;
- verificación exacta de `app.iberfit.cl`;
- smoke de entrada en Chromium;
- auditoría integral productiva read-only;
- evidencia exacta de deployment y rollback.

## Cambio de acceso incluido

PR #323 dejó el acceso en modelo state-first:
- primer paint en estado de comprobación, sin flash del formulario;
- recuperación silenciosa de sesión guardada;
- estado recuperable sin volver a pedir contraseña;
- login tradicional sólo cuando realmente está signed-out;
- errores técnicos fuera del copy principal;
- fallback de bootstrap sin congelación;
- comportamiento responsive y reduced-motion reforzado.

## Canary

- Rama: `canary/rc74-4`
- Baseline de código que produjo LIVE: `6d06d033fe09b6802bef21e0f30374b48c78edda`
- P0 técnico demostrado: 0.
- Rama protegida: `false` a este checkpoint.
- Los cambios documentales posteriores pueden mover HEAD sin cambiar el runtime productivo; distinguir siempre HEAD de Canary de source SHA LIVE.

## Supabase / seguridad

- QA ref: `gjztkdwfmunnzhtvxrsu`
- PROD ref: `pjhmrhejsoofmouedavw`
- WebAuthn privilegiado: mantener fail-closed.
- Bundle SQL histórico `33656032685`: SUPERSEDED; no ejecutar.
- Cualquier cambio DB futuro debe ser delta desde el baseline productivo live, no reejecución histórica.

## P0 / P1 actuales

### P0
Ninguno demostrado.

### P1
1. Convertir la evidencia visual actual en un Device Experience Gate real: Cliente + Coach post-WebAuthn + Admin autenticado × desktop/tablet portrait/tablet landscape/mobile.
2. Proteger `canary/rc74-4` con PR/checks obligatorios.
3. Cerrar el loop `señal -> decisión -> intervención -> outcome`.
4. Instrumentar funnel y capacidad operativa: lead -> IRI -> plan -> primera sesión -> adherencia -> 30/90/180 -> reactivación/referral/revenue + minutos Coach/cliente.
5. Certificar PWA/update/offline y task differentiation por dispositivo.

## Fuente de verdad documental

HQ deja de vivir sólo en `chore/iberfit-hq-bootstrap`. Debe integrarse en la línea técnica para que STATE/BACKLOG acompañen el sistema real.

## GO para producción

- LIVE exacto identificado;
- candidato exacto;
- diff entendido;
- CI/gates verdes;
- QA proporcional;
- auth/roles/RLS/WebAuthn según riesgo;
- rollback identificable;
- evidencia retenida;
- smoke post-deploy;
- ninguna mutación accidental de PROD.

## Siguiente acción exacta

1. Integrar esta documentación HQ en Canary.
2. Crear Device Experience Gate multidispositivo/rol con tareas reales.
3. Resolver protección de `canary/rc74-4`.
4. Implementar outcome tracking.
5. Instrumentar negocio/capacidad operativa.
