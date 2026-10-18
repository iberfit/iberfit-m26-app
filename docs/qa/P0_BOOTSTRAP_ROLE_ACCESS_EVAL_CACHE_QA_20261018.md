# P0 IBERFIT · Bootstrap role/access evaluation cache · 2026-10-18

## Hallazgo confirmado
El Device Experience Gate del 18/10/2026 registró un fallo autenticado Cliente en tablet horizontal. La petición `iberfit_bootstrap_v26()` terminó HTTP 500 tras ~9,13 s. En los logs PostgreSQL QA, el mismo instante contiene SQLSTATE `57014` sobre `iberfit_bootstrap_v26()`: cancelación por `statement_timeout`. Los roles `authenticated` y `authenticator` mantienen `statement_timeout=8s`; no se amplía ese límite.

En las últimas 24 h observadas hubo cinco cancelaciones `57014` del bootstrap autenticado. El segundo intento del gate terminó verde, por lo que es un fallo de cola/contención intermitente, no un defecto visual específico de tablet.

## Causa optimizada
`iberfit_can_access_client_v26()` evaluaba `iberfit_current_role_v26()` hasta tres veces por fila. A su vez, `iberfit_current_role_v26()` consultaba `iberfit_role()` dos veces. La nueva definición calcula el rol una sola vez por helper. En el caso Coach, tras haber demostrado que el rol es Coach, usa directamente la misma asignación activa `client_assignments(client_id, coach_user_id, active)` que empleaba `is_assigned_coach()`.

No cambian RLS, grants, Auth, WebAuthn, ownership, `search_path`, `SECURITY DEFINER`, `STABLE` ni timeouts.

## Evidencia QA
- Equivalencia de autorización sobre los fixtures QA disponibles: Admin, Coach y dos Cliente; todos los clientes visibles más caso `NULL`: 16 comprobaciones, 0 discrepancias; roles exactos.
- Equivalencia del núcleo `iberfit_bootstrap_v26_rc29()`: 15/15 JSON idénticos.
- Muestra secuencial de 5 ejecuciones por identidad del núcleo:
  - Cliente A: promedio 302,0 → 232,6 ms (~23% menos).
  - Cliente B: promedio 106,9 → 41,3 ms (~61% menos).
  - Coach: promedio 694,1 → 507,1 ms (~27% menos).
- Una candidata alternativa que precalculaba el universo de clientes fue descartada: llegó a timeout dentro de `iberfit_can_access_client_v26/iberfit_role`.
- QA registra la migración `20261018214135_p0_bootstrap_role_access_eval_cache_v1` y las definiciones públicas resultantes tienen hashes `aa12f60d12892506c8e08b0717aa8ee2` y `c6e7dc2917170e35f7ec23dc31d8f964`.

## Cierre pendiente
La corrección no se considera cerrada sólo por benchmark. Requiere gates autenticados reales repetidos y observación de ausencia de nuevas cancelaciones `57014` bajo carga. PROD permanece intacto hasta que el gate de recuperación M44 permita una migración productiva y la promoción exacta sea certificable.
