# RC65-C1 · MFA privilegiado antes del bootstrap

Base canónica: `3f034ea66f299a69b738a57da304b5ecf75fbe0e`

## Objetivo

Introducir MFA TOTP obligatorio en la aplicación para cuentas con rol Coach o Admin,
sin bloquear todavía dichas cuentas en base de datos antes de que puedan enrolar su
segundo factor.

## Estado QA antes de C1

La auditoría de QA encontró 2 usuarios privilegiados y 0 factores MFA verificados.
Por ello, activar `aal2` en las políticas/RPC centrales antes del enrolamiento produciría
un bloqueo total de Coach/Admin.

## Arquitectura

1. Email + contraseña produce sesión `aal1`.
2. Antes de cualquier bootstrap completo, la app llama exclusivamente a
   `iberfit_auth_assurance_context_v65c()`.
3. Ese RPC devuelve únicamente:
   - `privileged`
   - `privilegedRole`
   - `mfaRequired`
   - `aal`
4. Client en `aal1` continúa.
5. Coach/Admin en `aal1` no ejecuta `setupAuthenticated()`:
   - si ya existe TOTP verificado, muestra challenge;
   - si no existe, muestra enrolamiento obligatorio.
6. El enrolamiento y el challenge no se crean automáticamente. Requieren una acción
   explícita del usuario, para mantener los gates remotos read-only.
7. `verify` devuelve una sesión nueva. Antes del bootstrap, la app vuelve a consultar
   assurance y exige `aal2` para la cuenta privilegiada.

## REST MFA

- POST `/auth/v1/factors`
- POST `/auth/v1/factors/{factorId}/challenge`
- POST `/auth/v1/factors/{factorId}/verify`
- GET `/auth/v1/user` para factores existentes.

## Gate remoto

El smoke autenticado conserva semántica de solo lectura:
- Client A debe completar el shell autenticado normal.
- Coach debe quedar detenido en la pantalla MFA pre-bootstrap.
- El smoke no llama endpoints `/auth/v1/factors/...` que muten factores o challenges.

## Siguiente cierre

Una vez los 2 usuarios privilegiados QA tengan TOTP verificado:
- RC65-C2 impondrá `aal2` en los puntos centrales de autorización DB/RPC.
- Después se ejecutarán pruebas BOLA/IDOR Client A/B, coach asignado/no asignado y admin.
