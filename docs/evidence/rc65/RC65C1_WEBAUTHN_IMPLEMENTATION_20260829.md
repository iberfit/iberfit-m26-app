# RC65-C1 · Evidencia de implementación WebAuthn · 2026-08-29

- Base: `51aa2b292e9f57dfdf2d31bda7b2dc6fcbbdcab6` en `canary/rc74-4`.
- Alcance: frontend/transport/UI/tests/documentación y PWA shell; sin producción.
- Supabase QA: `gjztkdwfmunnzhtvxrsu`.
- Origin/RP canónico: `https://m26-canary.iberfit.cl` / `m26-canary.iberfit.cl`.
- Política: TOTP no satisface privilegios; WebAuthn verificado + sesión aal2 antes de bootstrap.
- Gates remotos: siguen siendo read-only; la ceremonia WebAuthn real se realiza únicamente por acción del usuario en Canary.
- La configuración de Auth y el registro físico de Coach/Admin se validan como pasos posteriores separados; este commit no presupone que estén hechos.
