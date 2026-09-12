# IBERFIT · Release Train LIVE → Canary

Estado: DISCOVERY / NO DEPLOY
Fecha de corte: 2026-09-02

## Baseline

- LIVE: `cb423a12402206a383d4174a168707b2d860c023`
- Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`
- relación Git: Canary está 43 commits por delante y 0 por detrás.

La diferencia toca, entre otros:

- login/auth layout;
- WebAuthn privilegiado;
- Admin/Coach;
- shell/UX premium;
- i18n/locale/fechas;
- communication/transports;
- canonical store;
- exercises/media;
- PWA/service worker/headers;
- remote gates/Playwright;
- una migration SQL de auth/bootstrap;
- tests de seguridad, roles, UX y resiliencia.

## Regla

**No hacer `LIVE -> Canary` como promoción única ni cherry-pick masivo.**

La historia contiene trabajo en ramas/sincronizaciones y dependencias. Antes de construir cada lote, Codex debe generar un grafo `git log --graph --oneline --decorate` entre ambos SHAs y un diff por módulo. La selección de commits se hace sólo después de entender dependencias.

## Lotes propuestos

Estos son dominios de promoción, no listas de commits aprobadas.

### Lote A · Acceso y estabilidad pre-auth

Objetivo:

- login bootstrap estable;
- layout de acceso robusto;
- navegación/preauth sin regresión;
- no cambiar todavía el contrato backend/RLS salvo dependencia imprescindible.

Evidencia de commits observados en la diferencia incluye, entre otros:

- `fb1d4ff...` — restore login bootstrap / harden auth layout;
- cambios en `public/m26/index.html`;
- `public/m26/preauth-critical.css`;
- tests de layout/auth productivo.

Riesgo: alto porque afecta acceso a usuarios reales.

Gate mínimo:

- login Cliente;
- login Coach/Admin hasta su gate esperado;
- refresh/logout;
- móvil/desktop;
- no exposición de datos;
- rollback inmediato.

Estado: `DISCOVERY`.

### Lote B · UX shell + idiomas + ergonomía Coach/Admin

Objetivo:

- shell ES/EN/FR/PT;
- locale/región;
- navegación Admin/Coach;
- workspaces premium;
- fechas y labels correctos;
- responsive.

Commits observados incluyen trabajo como:

- `b1945d5...` — four-language shell;
- `8ff0ffe...` — language/locale en shell model;
- `40a11ab...` — redesign Admin/Coach workspace shell;
- `64b2df3...` — role switcher across languages;
- `f808cb3...` — tests workspace/i18n;
- `57ec45f...` — CI workspace;
- `34338ca...` / `8246719...` — premium role ergonomics;
- cambios posteriores de fechas/i18n y sincronización.

Riesgo: medio-alto por superficie amplia, aunque predominantemente frontend.

Gate mínimo:

- tareas reales Coach/Admin;
- Cliente no degradado;
- todos los idiomas;
- rutas/roles;
- responsive;
- performance preauth;
- accesibilidad básica.

Estado: `DISCOVERY`.

### Lote C · Resiliencia de datos, transports y comunicación

Objetivo:

- timeouts/transport robustos;
- Admin/communication data flow;
- canonical store coherente;
- ejercicios/media con fallback seguro.

Archivos afectados observados:

- `src/m26/admin/controller.js`;
- `src/m26/admin/transport.js`;
- `src/m26/communication/controller.js`;
- `src/m26/communication/transport.js`;
- `src/m26/canonical-store.js`;
- `src/m26/rc39/transport.js`;
- `src/m26/exercises/catalog.js`;
- `src/m26/library/exercise-media.js`;
- tests de timeout/resilience.

Riesgo: medio-alto por datos y comportamiento asíncrono.

Gate mínimo:

- errores/timeout;
- estados loading/empty/error;
- no duplicación de comandos;
- idempotencia donde corresponda;
- no cross-tenant;
- degradación de media segura.

Estado: `DISCOVERY`.

### Lote D · Backend auth/bootstrap + migration

Objetivo:

Evaluar por separado la migration:

`supabase/migrations/20260902033214_p0_restore_primary_auth_read_bootstrap_v1.sql`

**No forma parte implícita de ningún lote frontend.**

Antes de considerar PROD:

- comparar esquema QA vs PROD;
- revisar SQL línea a línea;
- detectar locks/privilegios;
- RLS;
- backward compatibility con frontend LIVE;
- rollback/forward fix;
- ejecutar únicamente en QA primero;
- demostrar que no exige promoción simultánea de 43 commits.

Riesgo: crítico/high-risk.

Estado: `BLOCKED PENDING DB REVIEW`.

### Lote E · WebAuthn privilegiado + gates finales

Objetivo:

Conservar contrato fail-closed para Coach/Admin y tests que lo representen correctamente.

Checkpoint final observado incluye:

- `22427f3...` — require privileged WebAuthn assurance before bootstrap;
- `54e7c52...` — restore fail-closed privileged WebAuthn decision;
- `7dc2697...` — browser smoke assert fail-closed Coach gate;
- `9cbe3ad...` — restore fail-closed Coach WebAuthn gate.

Este comportamiento ya está certificado en Canary.

Riesgo: alto; afecta acceso privilegiado.

Gate mínimo:

- credencial inexistente -> enroll-required;
- credencial existente sin assurance -> challenge;
- assurance verificado -> ready;
- Cliente no requiere gate privilegiado;
- backend y frontend coinciden;
- 401/403 fail-closed;
- QA autenticado completo.

Estado: `CANARY CERTIFIED / NOT PROD APPROVED`.

## Cómo construir el primer lote real

Codex debe trabajar read-only inicialmente:

```text
Base: cb423a12402206a383d4174a168707b2d860c023
Head: 9cbe3ad29dfda0a552aa54c7e1404575b96786d4

1. Genera git log --graph --oneline --decorate Base..Head.
2. Agrupa cada commit por dominio y dependencia real.
3. Identifica merges/syncs y commits que no pueden cherry-pickearse aislados.
4. Para Lote A, crea un diff funcional mínimo deseado contra LIVE.
5. Señala qué cambios son ya necesarios en LIVE por bugs reales y cuáles son sólo evolución.
6. No crees rama de release ni modifiques código todavía.
```

Sólo después se elige la estrategia:

- cherry-pick de commits independientes;
- reimplementación mínima sobre LIVE;
- promoción de un punto contiguo del historial;
- o nuevo candidato construido desde Canary si el lote resulta inseparable.

## Orden recomendado de análisis

1. Lote A — acceso/estabilidad.
2. Lote E — WebAuthn, porque puede ser dependencia de acceso privilegiado.
3. Lote B — UX/i18n/Coach/Admin.
4. Lote C — transports/datos/media.
5. Lote D — migration, siempre separada y al final de su propia revisión.

El orden de **análisis** no implica orden de **deploy**.

## Criterio para reducir riesgo

Si un lote requiere demasiadas dependencias de otros lotes, no forzar separación artificial. En ese caso:

- documentar dependencia;
- ampliar lote conscientemente;
- repetir gates;
- mantener rollback;
- no introducir cambios adicionales mientras se certifica.

## Siguiente acción

Generar el grafo exacto y matriz commit→dominio→riesgo desde una copia limpia en Codex. Esa tarea es read-only y puede hacerse en paralelo con Website/Growth.
