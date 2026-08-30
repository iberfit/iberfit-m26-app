# RC65-C1 · WebAuthn privilegiado antes del bootstrap

Base canónica de implementación: `51aa2b292e9f57dfdf2d31bda7b2dc6fcbbdcab6`

## Objetivo

Migrar el segundo factor obligatorio de Coach/Admin desde TOTP a WebAuthn sin convertir el acceso principal en passwordless. El flujo objetivo es **contraseña → aal1 → WebAuthn → aal2 → bootstrap privilegiado**. Client continúa admitiendo aal1.

## Invariantes

1. Coach/Admin no ejecutan el bootstrap completo hasta que la sesión actual esté en `aal2` y exista un factor WebAuthn verificado para la cuenta.
2. TOTP no satisface la política privilegiada de RC65-C1, aunque exista como factor heredado. No hay fallback TOTP implícito.
3. Un WebAuthn `unverified` se reutiliza y se vuelve a desafiar como registro; no se crea un factor nuevo en cada login interrumpido.
4. Si WebAuthn no está soportado, el challenge no coincide, verify falla, cambia la identidad/rol o la sesión final no queda en `aal2`, el flujo falla cerrado y no hay bootstrap.
5. La ceremonia requiere acción explícita del usuario. Los gates remotos permanecen read-only y nunca llaman endpoints de factores.
6. IBERFIT recibe únicamente la respuesta criptográfica WebAuthn. Biometría/PIN/Windows Hello permanecen gestionados por navegador/SO y no son enviados a IBERFIT.

## Contrato Supabase Auth

- Enrolamiento: `POST /auth/v1/factors` con `factor_type: "webauthn"`.
- Challenge: `POST /auth/v1/factors/{factorId}/challenge`.
- El challenge WebAuthn devuelve `webauthn.type` = `create` para registro o `request` para autenticación, más `credential_options`.
- Verify: `POST /auth/v1/factors/{factorId}/verify` con `challenge_id` y `webauthn: { type, credential_response }`.
- Después de verify, la aplicación vuelve a consultar assurance y factores; solo continúa si la identidad/rol se conserva, `aal === "aal2"` y la política WebAuthn queda `ready`.

El RP/origin no se inventa en el frontend. Supabase Auth lo obtiene de su configuración de servidor.

## Configuración QA requerida

Proyecto único: `gjztkdwfmunnzhtvxrsu` (`iberfit-qa`).

- `mfa_web_authn_enroll_enabled = true`
- `mfa_web_authn_verify_enabled = true`
- `webauthn_rp_display_name = "IBERFIT"`
- `webauthn_rp_id = "m26-canary.iberfit.cl"`
- `webauthn_rp_origins = "https://m26-canary.iberfit.cl"`
- `passkey_enabled = false`

`passkey_enabled` permanece desactivado porque RC65-C1 utiliza WebAuthn como **segundo factor**, no como primer factor passwordless. No se usa `pages.dev` como origin alternativo.

## UI

- Alta/reanudación: **Protege tu cuenta** → **Configurar acceso seguro**.
- Login posterior: **Confirma tu identidad para continuar** → **Continuar de forma segura**.
- El navegador/SO presenta Windows Hello, biometría, PIN o llave de seguridad compatible.
- No se muestran QR, secretos TOTP ni campos de seis dígitos.

## Gate remoto

El smoke autenticado conserva su allowlist estricta de solo lectura. Para Coach verifica que el shell privilegiado no aparezca antes de MFA y no pulsa el botón WebAuthn. Client A completa el shell normal. Ningún gate remoto crea, desafía, verifica o elimina factores.

## Estado QA previo

La comprobación read-only previa a la migración encontró dos usuarios privilegiados, cero factores MFA verificados y un único residuo TOTP no verificado en Coach. Ese residuo no cuenta como MFA válido y no se elimina con SQL directo.

## Cierre C1 y paso a C2

C1 se considera cerrado únicamente cuando código/CI/gates Canary están verdes, Supabase QA tiene la configuración RP anterior, Coach y Admin han registrado WebAuthn mediante una ceremonia real y la sesión posterior demuestra `aal2`. Después RC65-C2 llevará la exigencia al servidor/DB y ejecutará las pruebas BOLA/IDOR correspondientes.
