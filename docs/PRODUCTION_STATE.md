# IBERFIT · Production State

Última actualización documental: 2026-09-14
Estado: checkpoint verificable alineado con Canary, producción y Auth.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA desplegado: `396ad52cfd4c1a4d75e4e306838d85bffa77b105`
- Source branch del lote: `canary/rc74-4`
- Promotion workflow verificado: `34793087805 · IBERFIT Production Promotion = SUCCESS`
- Release branch: `release/prod-396ad52cfd4c`
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD ref: `pjhmrhejsoofmouedavw`

Un intento posterior de promoción (`34794436834`, candidato `59305d7e...`) falló antes del despliegue en el gate de Hosted Auth emails. Wrangler y los pasos posteriores quedaron omitidos, por lo que no sustituyó el runtime LIVE anterior.

La promoción productiva válida certificó source/manifest exactos, regresión, build canónico, rollback, preflight, deploy con Wrangler, identidad productiva, smoke browser y auditoría read-only.

## Canary certificado

- Rama: `canary/rc74-4`
- HEAD certificado: `39e160fb54d1e866823a8150ecd9270359129444`
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

## Auth / correo transaccional

PROD mantiene:
- `site_url = https://app.iberfit.cl/`
- signup público deshabilitado;
- longitud mínima de contraseña >= 8;
- anonymous deshabilitado;
- autoconfirm deshabilitado;
- secure email change habilitado.

Bloqueo actual de release:
- no existe todavía SMTP personalizado completo para Auth;
- los secretos SMTP operativos siguen ausentes;
- Hosted Auth emails no deben sincronizarse ni promoverse hasta disponer de SMTP real.

El workflow operacional de configuración SMTP vive sólo en `ops/prod-auth-readiness-4baf6d52`; no debe fusionarse en Canary. Su rollback fue endurecido para fallar cerrado y rechazar configuración SMTP parcial legible. No ejecutarlo hasta disponer de credenciales reales verificadas.

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
1. Completar SMTP Auth productivo, DNS de entregabilidad y E2E real de correo.
2. Proteger `canary/rc74-4` con PR + required checks.
3. Completar validación autenticada real de Admin y Coach post-WebAuthn donde falte.
4. Cerrar flujos diarios de alta/edición/baja controlada y sesión Coach sin freezes.
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

1. Terminar SMTP externo y DNS.
2. Configurar secretos SMTP sin exponer valores.
3. Ejecutar configuración fail-closed y verificar.
4. Sincronizar 13 plantillas Hosted Auth.
5. Probar OTP/recovery/invite/resend/expiry/replay y mala conexión.
6. Sólo entonces promover el SHA certificado mediante `.github/workflows/production-promote.yml`.
