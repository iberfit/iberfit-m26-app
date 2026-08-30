# RC65-C2/C3 · adaptación del gate remoto · 2026-08-30

El run remoto `33316552833` falló en `Ejecutar gate autenticado sin mutaciones` porque el gate
histórico iniciaba sesión como Coach con email/contraseña y esperaba que
`iberfit_bootstrap_v26()` respondiera 200.

Después de C2 ese comportamiento sería un bypass. El resultado correcto antes de completar
WebAuthn en la sesión es:

- `iberfit_privileged_assurance_context_v65d()` → Coach privilegiado, credencial enrolada,
  `iberfitAssurance=required`, `supabaseAal=aal1`.
- `iberfit_bootstrap_v26()` → HTTP 403, mensaje `IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED`.

El gate V22 considera ese 403 un PASS de seguridad. No intenta automatizar WebAuthn y no muta
factores, assurance ni datos de dominio. Los dos Clientes QA continúan ejecutando bootstrap
read-only, privacidad e aislamiento entre clientes.

C2/C3 ya está aplicado en QA con ledger `20260830044500`; V22 no vuelve a aplicar migraciones.
