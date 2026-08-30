# RC65-C1 · Acceso privilegiado WebAuthn FREE

## Decisión

IBERFIT no usa el add-on **Advanced MFA - WebAuthn** de Supabase. El requisito del proyecto es
mantener la solución sin costes adicionales mientras exista una alternativa técnicamente sólida.

Coach y Admin usan WebAuthn directamente desde el navegador y el sistema operativo
(Windows Hello, Touch ID / Face ID, PIN del dispositivo o llave compatible). No hace falta instalar
Google Authenticator, Authy ni otra aplicación.

Los clientes no pasan por este segundo factor.

## Modelo de seguridad

El login primario sigue siendo Supabase Auth. Después del login:

1. `iberfit_privileged_assurance_context_v65d()` resuelve la membresía y el rol con
   `iberfit_application_context_v14()`.
2. Para Coach/Admin exige una credencial WebAuthn IBERFIT activa.
3. La Edge Function `iberfit-webauthn-v1` genera y verifica la ceremonia WebAuthn.
4. Los challenges son de un solo uso, quedan ligados a `user_id + session_id + origin` y caducan a
   los 5 minutos.
5. Tras una verificación correcta se crea `iberfit_privileged_assurance_v1` ligada al `session_id`
   real de Supabase. Caduca a las 12 horas y deja de servir si la sesión ya no existe en
   `auth.sessions`.
6. C2/C3 debe llamar server-side a `iberfit_require_privileged_assurance_v65d()` antes de ejecutar
   operaciones privilegiadas.

## Invariante importante

IBERFIT **no falsifica ni eleva** el claim `aal` de Supabase. `supabaseAal` se conserva únicamente
como dato diagnóstico. La autorización privilegiada se expresa con:

`iberfitAssurance = verified`

Esto evita depender del add-on de pago y mantiene una garantía server-side independiente.

## RP y origen Canary

- RP display name: `IBERFIT`
- RP ID: `m26-canary.iberfit.cl`
- Origin permitido: `https://m26-canary.iberfit.cl`
- `userVerification: required`
- `requireUserVerification: true`

No se acepta `pages.dev` como origen WebAuthn.

## Dependencias

La Edge Function fija versiones exactas:

- `@simplewebauthn/server@13.3.3`
- `@supabase/supabase-js@2.112.4`

No se implementa criptografía WebAuthn manual.

## Datos persistidos

`iberfit_webauthn_credentials_v1` almacena exclusivamente metadatos de credencial y clave pública,
nunca secretos biométricos. `iberfit_webauthn_challenges_v1` almacena challenges efímeros.
`iberfit_privileged_assurance_v1` almacena la autorización temporal de la sesión.

Las tres tablas tienen RLS y no conceden acceso directo a `anon` ni `authenticated`.

## Recuperación / fallback

No existe fallback silencioso a TOTP. Si WebAuthn no está disponible, el acceso privilegiado falla
cerrado. Un mecanismo de recuperación gratuito podrá añadirse posteriormente tras revisión de
seguridad, sin bloquear C2/C3.

## Coste

La arquitectura C1 FREE no activa ningún add-on de Supabase. La función y las tablas viven en el
proyecto QA existente. El criterio de IBERFIT es usar el nivel gratuito mientras sus cuotas sean
suficientes.
