# RC65-C2 + C3 · hardening server-side · 2026-08-30

## Objetivo

Cerrar el bypass de UI: un Coach/Admin no debe poder llamar directamente a RPC sensibles después
del login primario si la sesión actual no ha completado WebAuthn IBERFIT.

## Diseño

Se conservan los nombres de RPC públicos. La implementación anterior se renombra a `*_pre_v65e`,
se revoca para `public/anon/authenticated` y el nombre canónico pasa a ser un wrapper
`SECURITY DEFINER` con `search_path=''`.

Cada wrapper ejecuta primero:

`perform public.iberfit_require_privileged_assurance_v65d();`

El helper no bloquea a Client, por lo que las rutas cliente mantienen el contrato actual.

## Superficie cubierta

Se protegen 34 RPC de datos para actores privilegiados:

- 17 `SECURITY DEFINER` mediante wrapper canónico + implementación interna sin grant API.
- 17 `SECURITY INVOKER` mediante inyección del gate en el cuerpo existente, preservando RLS.

Incluye Admin, bootstraps, commands, comunicación, citas, onboarding/IRI, telemetría,
drafts, mediciones, sesiones, mensajería y wearables.

## BOLA / IDOR Admin

`ADMIN_ROL_OTORGAR` y `ADMIN_ROL_REVOCAR` ya no pueden operar sobre un `userId` sin membresía
en la organización activa. Mientras `user_application_roles` siga siendo global, se bloquean
mutaciones privilegiadas (`coach/admin`) sobre usuarios con membresías activas en más de una
organización.

`ADMIN_ASIGNACION_CREAR` exige que el Coach pertenezca activamente a la organización y tenga rol
Coach activo.

Toda mutación de `user_application_roles` se bloquea si el usuario tiene otra membresía activa, porque hoy esa tabla de roles es global.

Los comandos de asignación y ciclo de cliente validan que el UUID de cliente exista y rechazan
evidencia explícita de pertenencia a otra organización cuando no existe evidencia en la actual.

## Least privilege C3

- `iberfit_auth_assurance_context_v65c()` deja de ser ejecutable por `authenticated`.
- `iberfit_admin_require_v14()` vuelve a ser helper interno.
- Todos los `*_pre_v65e` quedan sin `EXECUTE` para roles API.
- Wrappers canónicos: solo `authenticated`, nunca `anon`.

## Sesión

No se inventa `aal2`. La autorización privilegiada continúa ligada al `session_id` real de
Supabase mediante `iberfit_privileged_assurance_v1` y se invalida en la práctica cuando la sesión
ya no existe.

## Coste

No activa Advanced MFA ni ningún add-on. Todo sigue en la arquitectura FREE de C1.
