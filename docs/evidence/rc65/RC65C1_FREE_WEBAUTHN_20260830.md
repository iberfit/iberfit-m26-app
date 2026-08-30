# RC65-C1 FREE WebAuthn · evidencia de decisión · 2026-08-30

- Proyecto QA: `gjztkdwfmunnzhtvxrsu` (`iberfit-qa`).
- Organización: IBERFIT, plan Free.
- El diagnóstico V15 mostró `auth_mfa_web_authn` como add-on disponible pero no seleccionado.
- El add-on Advanced MFA - WebAuthn se descartó por coste.
- Se eligió WebAuthn gestionado por IBERFIT, integrado en el navegador, sin aplicaciones externas.
- La migración remota QA quedó registrada como `20260830033156 rc65c1_free_webauthn_assurance`.
- Edge Function QA: `iberfit-webauthn-v1`, `verify_jwt=true`.
- Producción y `main` quedan fuera de alcance.
- Supabase `aal` no se altera; C1 usa `iberfitAssurance=verified`.
