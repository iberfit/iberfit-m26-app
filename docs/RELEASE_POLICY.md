# IBERFIT · Release Policy

## Contexto actual

`app.iberfit.cl` tiene usuarios reales. Al checkpoint 2026-09-13, producción fue promovida correctamente desde `canary/rc74-4` source SHA `6d06d033fe09b6802bef21e0f30374b48c78edda` mediante run `34776097179`.

No existe ya el antiguo bloqueo “no conocemos Cloudflare productivo”. El proyecto productivo y el rollback se resuelven durante el workflow de promoción.

## Carril 1 · LIVE SUPPORT / HOTFIX

Usar para P0/P1 reales.

Base: identidad LIVE exacta leída en ese momento.

Flujo:
1. leer LIVE;
2. rama hotfix mínima;
3. reproducir read-only/QA;
4. fix mínimo;
5. tests focales;
6. QA equivalente;
7. diff exacto;
8. rollback;
9. deploy controlado;
10. smoke;
11. actualizar STATE;
12. reconciliar con evolución.

No mezclar features/refactors opcionales.

## Carril 2 · PRODUCT EVOLUTION

Base: Canary vigente.

Flujo:
1. rama pequeña;
2. objetivo/criterio de cierre;
3. implementación;
4. tests;
5. PR;
6. integración Canary;
7. QA autenticado/visual;
8. gates por dispositivo y rol si aplica;
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
- preflight en Pages;
- desplegar con Wrangler;
- verificar identidad exacta de `app.iberfit.cl`;
- ejecutar smoke browser;
- ejecutar auditoría read-only;
- registrar evidencia.

## Auth / RLS / WebAuthn

Siempre high-risk:
- separación Cliente/Coach/Admin;
- tenant isolation;
- privilegio fail-closed;
- recovery/refresh;
- 401/403 esperados;
- no almacenar password;
- QA post-MFA cuando el cambio afecta Coach/Admin.

## Device Experience Gate

Cambios relevantes de shell/rutas/UX crítica deben probar:
- desktop;
- tablet portrait;
- tablet landscape cuando sea operativamente relevante;
- móvil;
- touch/focus/scroll;
- estados loading/empty/error;
- tarea real, no sólo captura.

## DB

- partir de PROD live;
- delta nuevo;
- QA antes de PROD;
- RLS/privilegios revisados;
- compatibilidad backward;
- rollback/expand-contract cuando aplique;
- bundle histórico `33656032685` permanece retirado.

## GO

Sólo si:
- source/candidato exactos;
- checks verdes;
- QA proporcional;
- rollback;
- P0=0;
- P1 del lote resueltos o excepción explícita;
- evidencia retenida.

## NO-GO

SHA ambiguo, gate rojo, auth/RLS dudoso, migration no validada, rollback inexistente, producción state desactualizado o rama movida inesperadamente.
