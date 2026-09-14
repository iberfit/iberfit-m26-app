# IBERFIT · Production State

Última actualización documental: 2026-09-14
Estado: checkpoint verificable alineado con Canary, producción y Auth.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA desplegado: `b2e4a20c7f5b6a7696cdfa96b66e11956f9493a6`
- Source branch del lote: `canary/rc74-4`
- Promotion workflow verificado: `34805512111 · IBERFIT Production Promotion = SUCCESS`
- Release branch: `release/prod-b2e4a20c7f5b`
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD ref: `pjhmrhejsoofmouedavw`

Un intento inmediatamente anterior (`34805438220`) falló antes del despliegue porque el generador productivo exige `sourceBranch=canary/rc74-4`; Wrangler y el cutover quedaron omitidos. Se corrigió sin debilitar el guardrail y la promoción válida `34805512111` completó deploy, identidad, smoke Chromium, auditoría read-only y evidencia de rollback.

La promoción productiva válida certificó source/manifest exactos, regresión, build canónico, rollback, preflight, deploy con Wrangler, identidad productiva, smoke browser y auditoría read-only.

## Canary certificado

- Rama: `canary/rc74-4`
- SHA funcional certificado: `39e160fb54d1e866823a8150ecd9270359129444`
- Merge asociado: PR #351 · queue shared authenticated QA gates.
- P0 funcional demostrado: 0 en el lote certificado.
- Rama protegida: `false` al checkpoint; sigue siendo deuda P1 de gobernanza.

Evidencia post-merge exacta sobre `39e160fb...`:
- IBERFIT M26 CI: SUCCESS.
- Continuous App Audit: SUCCESS.
- Device Experience Gate: SUCCESS.
- Daily Use Visual Evidence: SUCCESS.
- Gates remotos de solo lectura: SUCCESS.

La serialización compartida de QA autenticado usa una cola común con `queue: max` para evitar interferencias y cancelaciones entre Daily, Device y Remote manteniendo en paralelo las superficies que no comparten sesión.

Los commits exclusivamente documentales posteriores pueden mover el HEAD de Canary sin invalidar el SHA funcional certificado; producción siempre se promueve desde un source SHA funcional explícito.

## Auth / correo transaccional

PROD mantiene:
- `site_url = https://app.iberfit.cl/`
- signup público deshabilitado;
- longitud mínima de contraseña >= 8;
- anonymous deshabilitado;
- autoconfirm deshabilitado;
- secure email change habilitado.

Estado Auth productivo:
- SMTP personalizado Resend operativo desde `acceso@auth.iberfit.cl`;
- SPF, DKIM y DMARC verificados; DMARC `p=quarantine` para `auth.iberfit.cl`;
- 13 plantillas Hosted Auth IBERFIT sincronizadas y verificadas con rollback protegido;
- OTP email de 6 dígitos, expiración 3600 s y límite global de correo Auth 30/h;
- OTP real y recovery real entregados a Gmail IBERFIT;
- secure password change habilitado;
- secretos SMTP presentes en GitHub sin exposición de valores.

El workflow operacional SMTP permanece aislado en `ops/prod-auth-readiness-4baf6d52` y no debe fusionarse en Canary.

## Supabase / seguridad

- PROD: `pjhmrhejsoofmouedavw` · `ACTIVE_HEALTHY`.
- QA: `gjztkdwfmunnzhtvxrsu`.
- WebAuthn privilegiado: mantener fail-closed.
- Bundle SQL histórico `33656032685`: SUPERSEDED; no ejecutar.
- Cualquier cambio DB futuro debe ser un delta nuevo desde el baseline productivo real.
- Los avisos de Security Advisor sobre RLS sin políticas y SECURITY DEFINER deben revisarse por intención y rutas de autorización antes de modificar nada; no aplicar políticas o índices cosméticos a ciegas.

## P0 / P1 actuales

### P0
Ninguno demostrado en el Canary certificado.

### P1
1. Proteger `canary/rc74-4` con PR + required checks.
2. Completar validación autenticada real de Admin y Coach post-WebAuthn donde falte.
3. Cerrar flujos diarios de alta/edición/baja controlada y sesión Coach sin freezes.
4. Completar edge cases Auth restantes: invite, resend, expiry/replay y mala conexión.
5. Instrumentar señal -> decisión -> intervención -> outcome y funnel/capacidad/revenue con utilidad real.

## GO para una próxima promoción

Sólo cuando:
- source/candidato exactos;
- Canary certificado;
- SMTP/Auth readiness GREEN;
- plantillas Hosted Auth sincronizadas y verificadas;
- correo real E2E probado;
- rollback identificable;
- smoke y auditoría post-deploy;
- ninguna mutación accidental de PROD.

## Siguiente acción exacta

1. Proteger Canary con PR + required checks.
2. Completar Admin/Coach autenticado por dispositivo.
3. Validar alta/edición/baja controlada y sesión Coach real sin freezes.
4. Completar edge cases Auth pendientes sin degradar el canal ya certificado.
5. Continuar mejoras de producto, rendimiento, datos y negocio sobre el nuevo baseline LIVE.
