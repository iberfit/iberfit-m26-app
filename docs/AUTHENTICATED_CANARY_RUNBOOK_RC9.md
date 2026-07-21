# IBERFIT M26 RC9 · Runbook de QA autenticado

## Alcance

El ejecutor `qa/rc9_authenticated_canary.mjs` valida sin hardcodear secretos:

1. Acceso de la cuenta Coach QA.
2. Acceso de la cuenta Cliente QA.
3. Rol devuelto por bootstrap para cada cuenta.
4. Prefijo de correo reservado para QA.
5. Lectura autenticada de `domain_command_registry_v26`.
6. Comparación completa de los 44 comandos, entidades, eventos, roles y requisitos.
7. Preflight opcional de comandos suministrados por variables de entorno.

El ejecutor no llama a `execute` y no realiza mutaciones por defecto.

## Variables obligatorias

```text
M26_SUPABASE_URL
M26_SUPABASE_PUBLISHABLE_KEY
M26_QA_COACH_EMAIL
M26_QA_COACH_PASSWORD
M26_QA_CLIENT_EMAIL
M26_QA_CLIENT_PASSWORD
```

## Preflight opcional

Se puede entregar un comando JSON completo mediante:

```text
M26_QA_COACH_PREFLIGHT_COMMAND
M26_QA_CLIENT_PREFLIGHT_COMMAND
```

## Ejecución

```text
npm run qa:authenticated
```

El reporte se guarda en `recovery/RC9_AUTHENTICATED_QA_REPORT.json`. Un catálogo incompleto, un rol incorrecto o un preflight rechazado produce código de salida distinto de cero.

## Bloqueo de seguridad

Las credenciales no se incluyen en el repositorio, el ZIP, los snapshots offline ni los reportes. El canario no debe ejecutarse con clientes reales.
