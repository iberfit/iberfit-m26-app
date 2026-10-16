# P0 IBERFIT · Bootstrap JSONB projection performance · 2026-10-16

## Alcance exacto
- Proyecto Supabase intervenido: **iberfit-qa** (`gjztkdwfmunnzhtvxrsu`). **Producción no intervenida**.
- Función: `public.iberfit_bootstrap_v26_pre_v65e()`, SECURITY DEFINER existente, owner postgres, acl `postgres=X/postgres,service_role=X/postgres`, SET search_path vacío.
- Baseline `pg_get_functiondef` MD5: `115246a2fb1aea298d023e44508c7dba`; definición QA instalada MD5: `7416e0d52d6fa069cf467e95420d4034`. La misma definición baseline está presente en PROD al certificar la QA.
- Migración QA registrada por Supabase: `20261016182255_p0_bootstrap_jsonb_overlay_v1`.
- Mecanismo: 10 `jsonb_set(v_data,...)` sucesivos se sustituyen por actualizaciones acumuladas `v_updates`, con una única combinación final `v_data || v_updates`. No cambia ninguna consulta, ordenación, JSON de salida, control de publicación ni función de autorización.

## Validación de paridad y rendimiento (QA sintética)
- Antes de instalar: 12 ejecuciones comparadas en una transacción de solo diagnóstico, **JSON idéntico** en una identidad Admin, una Coach y dos Cliente. ROLLBACK al final.
- Después de instalar: otras 12 comparaciones de la implementación en QA contra la definición original en una transacción revertida: **JSON idéntico** para las cuatro identidades. Sin retornar cuerpos JSON ni identidades.
- Admin (3 iteraciones): baseline `512.56/563.19/473.41 ms`; optimizado `317.21/394.82/319.44 ms`.
- Coach (3 iteraciones): baseline `647.43/651.33/623.78 ms`; optimizado `389.71/377.02/393.14 ms`.
- Cliente con más datos (3 iteraciones): baseline `1083.39/774.60/798.19 ms`; optimizado `585.91/571.47/555.06 ms`. Segundo Cliente: de `104.43/80.30/79.58` a `81.10/79.47/78.87 ms`.
- Muestras secuenciales, no ensayo de saturación ni garantía absoluta de no recibir HTTP 500 en periodos futuros.

## Seguridad y reversibilidad
- No cambios en Auth/WebAuthn, RLS, grants, esquemas de tablas, SQL de filtrado, parámetros de timeout ni identidad de sesión.
- La migración aborta ante cualquier variación del MD5 baseline. El rollback solo puede restaurar desde el MD5 de la versión optimizada que probamos.
- QA post-apply metadata: owner/postgres y ACL equivalentes. PROD MD5 original inalterado.
- **Mantener #974 abierto** hasta pasar repetidamente el gate remoto MFA/no-enrolado/403 y los tests de estrés, observar error rate y corregir si persisten timeouts.
- Las modificaciones visuales #966/#993 siguen en sus propios PR y no deben fusionarse como consecuencia de esta migración sin sus gates completos.

## Recuperación
Revertir únicamente en el proyecto correspondiente, usando `supabase/rollbacks/p0_bootstrap_jsonb_overlay_v1.rollback.sql` después de comprobar hash, evidencia y ventanas activas. No ejecutar rollback en una versión diferente.
