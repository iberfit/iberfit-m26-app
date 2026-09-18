# IBERFIT · Production State

Última actualización documental: 2026-09-17
Estado: fuente de verdad operativa para LIVE, Canary y Auth.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA LIVE verificado: `1eabb642634ade1fec74b0d3b32d703e7d314eff`
- Release branch: `release/prod-1eabb642634a`
- Promotion run: `35259458571 = SUCCESS`
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD: `pjhmrhejsoofmouedavw`

El lote LIVE cerró el incidente P0 de focus/select y la entrega PWA stale-safe. No se considera que mejoras posteriores estén en producción mientras no exista una promoción nueva verificada de forma explícita.

## Canary actual

- Rama: `canary/rc74-4`
- HEAD: `b23688196e49f6dc26d2762ef592e80ab1b8ed80`
- Último merge: PR #477.
- P0 funcional demostrado: 0 en las rondas certificadas actuales.
- Branch protection: no disponible mediante el conector GitHub actual; deuda P1 aún abierta.

### Hardening integrado después de LIVE

- PR #471: gate autenticado permanente + fixes finales de interacción/foco.
- PR #472: refresh silencioso al volver de background/online, sin rerender.
- PR #473: logout local por defecto; revocación global explícita.
- PR #474: refresh tokens/sesiones revocados terminan login sin retry loops.
- PR #475: email OTP resend, expiry/replay/rate-limit/red con UX recuperable.
- PR #476: paridad arquitectónica QA/PROD de la Edge de invitaciones.
- PR #477: reintento Admin de invitación fallida sin recrear cliente ni duplicar identidad.

Los heads finales de estos lotes pasaron Fast Lane, CI, Continuous Audit y los gates aplicables de Admin/Device/Authenticated Client/QA Real Write.

## Supabase QA

- Proyecto: `gjztkdwfmunnzhtvxrsu`
- Estado: `ACTIVE_HEALTHY`
- `iberfit-webauthn-v1`: misma implementación canónica que PROD.
- `iberfit-admin-client-invite-v1`: v26.4, `verify_jwt=false`, validación interna de bearer con `auth.getUser()`, origen QA limitado a `m26-canary.iberfit.cl`.
- Source Edge QA = source Canary en el checkpoint.
- QA Real Write certifica:
  - token inválido bloqueado;
  - Coach bloqueado para reenvío de invitaciones;
  - direct insert/update/delete bloqueados;
  - cross-client read/command bloqueados;
  - privileged assurance requerido;
  - idempotencia/persistencia controladas.

PROD de la Edge de invitación no se ha modificado durante este bloque.

## Auth / correo transaccional PROD

PROD mantiene:

- `site_url = https://app.iberfit.cl/`
- signup público deshabilitado;
- longitud mínima de contraseña >= 8;
- anonymous y autoconfirm deshabilitados;
- secure email change habilitado;
- SMTP personalizado Resend desde `acceso@auth.iberfit.cl`;
- SPF, DKIM y DMARC verificados;
- 13 plantillas Hosted Auth IBERFIT sincronizadas;
- OTP email de 6 dígitos y recovery real certificados;
- secure password change habilitado.

La aplicación mantiene WebAuthn como opción preferente de assurance privilegiada y fallback por código de correo cuando corresponde.

## Seguridad / backend

- PROD y QA: `ACTIVE_HEALTHY`.
- WebAuthn privilegiado: fail-closed.
- Los dos SECURITY DEFINER anon revisados corresponden a lectura pública intencional de catálogo/media.
- RPC Admin críticos revisados exigen privileged assurance, Admin, organización y scope.
- Las alertas generales de RLS/SECURITY DEFINER/índices no se corrigen de forma masiva; deben resolverse por intención y consultas reales.
- Leaked-password protection continúa condicionado al plan Supabase disponible.

## P0 / P1 actuales

### P0

Ninguno demostrado en el Canary actual.

### P1

1. Admin autenticado QA real desktop/tablet/móvil.
2. E2E positivo Admin de invitación/reenvío y alta/edición/baja controlada.
3. Sesión Coach real por dispositivo sin freezes y recuperación de error.
4. Completar auditoría SECURITY DEFINER/RLS/índices por intención.
5. Proteger Canary con required checks cuando la configuración del repositorio esté disponible.
6. Outcome tracking, preparar próxima sesión y seguimiento longitudinal.

## GO para una próxima promoción

Sólo cuando:

- source/candidato exactos;
- Canary certificado sobre ese SHA;
- SMTP/Auth readiness GREEN;
- Edge/DB QA relevantes en paridad con el código que se quiere promover;
- Admin/Coach autenticados reales suficientemente cubiertos;
- rollback identificable;
- smoke y auditoría post-deploy;
- ninguna mutación accidental de PROD.

La promoción debe distinguir código preparado, PR, merge, Canary certificado, release y LIVE. Ningún merge a Canary implica producción por sí mismo.
