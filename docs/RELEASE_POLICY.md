# IBERFIT · Release Policy

## Contexto actual

`app.iberfit.cl` tiene usuarios reales. Producción debe tratarse como un sistema activo y no como un entorno de prueba.

Baseline LIVE verificado al 2026-09-14:
- source SHA: `b2e4a20c7f5b6a7696cdfa96b66e11956f9493a6`;
- promotion run: `34805512111 = SUCCESS`;
- Cloudflare project: `iberfit-m26-production`;
- Supabase PROD: `pjhmrhejsoofmouedavw`.

Canary funcional certificado:
- `39e160fb54d1e866823a8150ecd9270359129444`;
- CI, auditoría continua, Device Gate, Daily Visual y Remote Gates en GREEN.

SMTP Auth productivo, OTP de 6 dígitos, recovery real, SPF/DKIM/DMARC y secure password change están activos y verificados. Los edge cases de invite/resend/expiry/replay/mala conexión siguen siendo cobertura P1, no un bloqueo retroactivo del baseline ya certificado.

## Carril 1 · LIVE SUPPORT / HOTFIX

Usar sólo para P0/P1 reales en producción.

Base: identidad LIVE exacta leída en ese momento.

Flujo:
1. leer LIVE;
2. reproducir sin mutar producción;
3. rama hotfix mínima;
4. fix mínimo;
5. tests focales;
6. QA equivalente;
7. diff exacto;
8. rollback;
9. deploy controlado;
10. smoke;
11. actualizar STATE;
12. reconciliar con Canary.

No mezclar features/refactors opcionales.

## Carril 2 · PRODUCT EVOLUTION

Base: último SHA funcional certificado de Canary; los commits exclusivamente documentales pueden mover el HEAD sin alterar el runtime.

Flujo:
1. rama pequeña;
2. objetivo y criterio de cierre;
3. implementación;
4. tests;
5. PR;
6. integración Canary;
7. recertificación sobre el merge SHA exacto;
8. QA autenticado/visual proporcional;
9. lote de promoción;
10. workflow productivo fail-closed.

## Producción

La promoción estándar debe:
- crear release branch desde source SHA exacto;
- añadir sólo manifest de promoción;
- ejecutar regresión;
- construir superficie canónica;
- generar runtime PROD;
- capturar rollback;
- ejecutar preflight;
- sincronizar/verificar Auth email sólo si SMTP readiness está completo;
- desplegar con Wrangler;
- verificar identidad exacta de `app.iberfit.cl`;
- ejecutar smoke browser;
- ejecutar auditoría read-only;
- registrar evidencia.

Nunca saltar `.github/workflows/production-promote.yml` para publicar una build de la app.

## Auth / SMTP / RLS / WebAuthn

Siempre high-risk:
- separación Cliente/Coach/Admin;
- tenant isolation;
- privilegio fail-closed;
- recovery/refresh;
- 401/403 esperados;
- no almacenar passwords ni credenciales SMTP en código;
- WebAuthn/assurance probado para rutas privilegiadas;
- correo Auth con SMTP productivo, SPF/DKIM/DMARC y E2E real antes de depender de OTP/recovery/invite.

Password-change reauthentication está habilitado porque el canal de correo real ya fue certificado con entrega, OTP, recovery y autenticación de dominio.

## Device Experience Gate

Cambios relevantes de shell/rutas/UX crítica deben probar:
- desktop;
- tablet portrait;
- tablet landscape cuando sea operativamente relevante;
- móvil;
- touch/focus/scroll;
- estados loading/empty/error/recovery;
- tarea real, no sólo captura.

Los workflows que comparten las mismas cuentas QA autenticadas deben serializar esa sección mediante la cola compartida; no volver a ejecutar esas suites en paralelo contra las mismas sesiones.

## DB

- partir de PROD live;
- delta nuevo;
- QA antes de PROD;
- RLS/privilegios revisados;
- compatibilidad backward;
- rollback/expand-contract cuando aplique;
- no crear índices sólo para silenciar advisors: comprobar consultas y coste real;
- bundle histórico `33656032685` permanece retirado.

## GO

Sólo si:
- source/candidato exactos;
- checks verdes sobre el SHA a promover;
- QA proporcional;
- SMTP/Auth GREEN cuando el lote dependa de correo;
- rollback;
- P0=0;
- P1 del lote resueltos o excepción explícita;
- evidencia retenida.

## NO-GO

SHA ambiguo, gate rojo/cancelado, auth/RLS dudoso, SMTP incompleto cuando el flujo lo requiere, migration no validada, rollback inexistente, producción state desactualizado o rama movida inesperadamente.
