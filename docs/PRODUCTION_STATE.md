# IBERFIT · Production State

Última actualización documental: 2026-09-17
Estado: checkpoint verificable alineado con LIVE, Canary y el cierre P0 de interacción/PWA.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Estado: PRODUCCIÓN REAL.
- Source SHA desplegado: `1eabb642634ade1fec74b0d3b32d703e7d314eff`
- Source branch: `hotfix/p0-sw-runtime-revision-20260917`
- Release lane: LIVE SUPPORT desde la base productiva exacta `551c3deab5f2956f17fbf6ef516871d6645f7100`.
- Promotion workflow verificado: `35259458571 · IBERFIT Production Promotion = SUCCESS`.
- Release branch: `release/prod-1eabb642634a`
- Release branch commit: `dc94962ddfcc53adbb93de57188806a4687452dd`
- Cloudflare Pages productivo: `iberfit-m26-production`
- Supabase PROD ref: `pjhmrhejsoofmouedavw`

La promoción productiva válida certificó source/manifest exactos, regresión completa, build canónico, Lighthouse, rollback, runtime determinista, identidad de Service Worker, preflight sobre el mismo proyecto Pages, deploy con Wrangler, identidad exacta de `app.iberfit.cl`, entrada interactiva en Chromium y auditoría integral read-only.

### Cierre P0 PWA / foco de formularios

El source LIVE contiene el hardening real de interacción del shell: mientras un input, textarea, select o formulario está activo se posponen rerenders incompatibles; se preservan foco/continuidad y existen ventanas específicas para `pointerup`, selects nativos, blur y entrada táctil.

El hotfix productivo adicional corrige la vía de entrega del runtime para impedir que una PWA instalada conserve `/src/m26/**` de una release anterior:
- la identidad del Service Worker canónico se deriva del source SHA exacto;
- `/m26/iberfit-sw.js` cambia con cada release y queda ligado a `/m26/sw.js`;
- preview y producción validan wrapper + worker + runtime de forma fail-closed;
- se eliminó el autorrepair temporizado que podía desregistrar el worker, borrar cachés y recargar durante uso activo;
- rollback permanece identificable por release branch.

El follow-up #461 añade la regresión explícita de PWA instalada N-1 -> N para `shell-controller.js`, preservando sesión, draft local, lineage de caché y protección contra loops de recarga.

La entrega y los contratos automáticos están certificados. Sigue siendo útil una confirmación manual en un dispositivo que hubiera sufrido originalmente el síntoma «solo funciona mientras mantengo pulsado», pero no es sustituto ni condición de los gates automatizados ya verdes.

## Canary certificado

- Rama: `canary/rc74-4`
- HEAD actual: `223a58a7de23888ea3c90256331f52161e68b208`
- Merge asociado: PR #461 · PWA shell upgrade contract.
- P0 funcional demostrado por automatización: 0 en el lote actual.
- Rama protegida: no confirmada como protegida; sigue siendo deuda P1 de gobernanza hasta verificar/configurar required checks.

Evidencia exacta previa al merge de #461 sobre `3a9684f8c28754c04665c02ce7e5098457595983`:
- IBERFIT M26 CI `35269132786`: SUCCESS.
- Continuous App Audit `35269132713`: SUCCESS.
- Device Experience Gate `35269133155`: SUCCESS.
- Admin Interaction Matrix `35269132714`: SUCCESS en Chromium, WebKit y Firefox.

El Device Gate certificó además PWA instalada, Admin sintético por dispositivo y Cliente/Coach autenticados, incluido Genio guiado. La matriz de interacción ejecutó inputs, selects, foco, `pointerup`, tap y rerender en los proyectos canónicos configurados.

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

- PROD: `pjhmrhejsoofmouedavw` · `ACTIVE_HEALTHY` en el último checkpoint operativo.
- QA: `gjztkdwfmunnzhtvxrsu`.
- WebAuthn privilegiado: mantener fail-closed.
- Bundle SQL histórico `33656032685`: SUPERSEDED; no ejecutar.
- Cualquier cambio DB futuro debe ser un delta nuevo desde el baseline productivo real.
- Los avisos de Security Advisor sobre RLS sin políticas y SECURITY DEFINER deben revisarse por intención y rutas de autorización antes de modificar nada; no aplicar políticas o índices cosméticos a ciegas.

## P0 / P1 actuales

### P0
Ninguno demostrado en los gates actuales. El incidente histórico de inputs/selects queda protegido tanto por lógica de interacción como por contrato de actualización PWA.

### P1
1. Verificar/configurar protección de `canary/rc74-4` con PR + required checks.
2. Completar validación autenticada real de Admin y Coach post-WebAuthn donde falte.
3. Cerrar alta/edición/baja controlada y sesión Coach real sin freezes, incluida recuperación de error por dispositivo.
4. Completar edge cases Auth restantes: invite, resend, expiry/replay y mala conexión.
5. Continuar Action Outcome Tracking, progreso longitudinal y métricas de funnel/capacidad/revenue con utilidad real.
6. Optimizar tiempo de CI cross-browser sin reducir cobertura ni convertir fallos en soft-pass.

## GO para una próxima promoción

Sólo cuando:
- source/candidato exactos;
- Canary certificado;
- Auth/SMTP readiness GREEN cuando el lote toque Auth;
- rollback identificable;
- regresión, device gate y matrices relevantes verdes;
- smoke y auditoría post-deploy;
- ninguna mutación accidental de PROD.

## Siguiente acción exacta

1. Completar Admin/Coach autenticado por dispositivo y CRUD/sesión Coach real sin freezes.
2. Mantener una sola estrategia PWA oficial; no reintroducir la alternativa superseded del PR #459.
3. Completar edge cases Auth pendientes sin degradar el canal ya certificado.
4. Continuar producto: preparación de próxima sesión, seguimiento longitudinal y outcomes.
5. Mejorar velocidad de certificación CI manteniendo los mismos navegadores, dispositivos y garantías.
