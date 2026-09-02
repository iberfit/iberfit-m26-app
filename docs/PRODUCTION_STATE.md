# IBERFIT · Production State

Última actualización documental: 2026-09-02
Estado: checkpoint verificable. Releer LIVE, rama/SHA, CI y gates antes de cualquier mutación.

## Regla operacional principal

`app.iberfit.cl` es PRODUCCIÓN REAL, está en uso y tiene usuarios reales.

Por tanto:

- producción no es un entorno de prueba;
- cualquier lectura de datos reales debe respetar privacidad y mínimo acceso;
- no hacer escrituras, migraciones, RLS, auth, DNS o deploys productivos salvo flujo de release explícito;
- un bug de LIVE y una mejora de producto siguen carriles distintos para no arrastrar cambios no relacionados.

## Repositorio

- Canónico técnico: `iberfit/iberfit-m26-app`
- Visibilidad observada: public
- Rama por defecto observada: `prepublicacion/rc29`
- El README histórico contiene reglas que no siempre representan el estado actual; código, LIVE, gates y esta documentación viva tienen prioridad.

## Producción LIVE

- Dominio: `https://app.iberfit.cl`
- Release observado: RC74.4
- SHA de artefacto observado: `cb423a12402206a383d4174a168707b2d860c023`
- Ese SHA es ancestro directo de la línea Canary actual.
- Producción tiene usuarios reales y debe conservar continuidad de servicio y datos.

Antes de cualquier hotfix/release, volver a leer `version.json`/identidad del artefacto LIVE y abortar si ya no coincide con este checkpoint.

## Canary QA — checkpoint certificado

- Rama: `canary/rc74-4`
- HEAD: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`
- Commit: `fix(auth): restore fail-closed Coach WebAuthn gate`
- Cloudflare Pages: `iberfit-m26-canary`
- Dominio: `https://m26-canary.iberfit.cl`
- Supabase QA: `gjztkdwfmunnzhtvxrsu`
- `Automatic deployments`: PAUSED intencionalmente

Certificación final exacta:

- SHA Canary live = `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`;
- RemoteGateRun = `33641163059`;
- RemoteGateConclusion = `success`;
- ProductionSupabaseMutations = `0`;
- MainTouched = `false`;
- AppCoachProductionDomainsTouched = `false`.

El contrato WebAuthn privilegiado queda validado fail-closed en este checkpoint.

## Divergencia LIVE ↔ Canary

Comparación verificable:

- base LIVE: `cb423a12402206a383d4174a168707b2d860c023`;
- Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`;
- Canary está **43 commits por delante**;
- Canary no está detrás de LIVE.

La diferencia incluye auth/login, WebAuthn, Admin/Coach, i18n, shell/UX premium, transports, comunicación, ejercicio/media, PWA/gates y una migración SQL, entre otros cambios.

### Consecuencia

**No promover los 43 commits de golpe sólo porque Canary esté verde.**

Desde ahora existen dos carriles de código:

1. **LIVE SUPPORT / HOTFIX**
   - para P0/P1 reales observados en producción;
   - nace del SHA LIVE exacto;
   - cambio mínimo y aislado;
   - se valida y promueve sin arrastrar el tren completo de Canary.

2. **PRODUCT EVOLUTION**
   - nace del Canary vigente;
   - contiene mejoras, UX, producto y nuevas capacidades;
   - se promociona en lotes deliberados, recertificados y reversibles.

Ver `docs/RELEASE_POLICY.md`.

## Supabase

### QA

- proyecto: `gjztkdwfmunnzhtvxrsu`;
- último gate autenticado: verde;
- aislamiento Cliente A/B: validado en evidencia reciente;
- WebAuthn privilegiado: fail-closed;
- validaciones recientes: 0 mutaciones de PROD.

### PROD

Tratar como sistema vivo con datos reales.

No ejecutar por defecto:

- migraciones;
- cambios RLS;
- escrituras de prueba;
- creación/borrado de usuarios;
- correcciones manuales de datos;
- pruebas destructivas;
- service-role desde tooling no aprobado.

Cualquier cambio de backend productivo requiere preflight, backup/rollback aplicable, gate específico y confirmación de identidad de entorno.

## Trabajo activo

### APP / producto

Canary contiene una evolución relevante por delante de LIVE. Antes de promoción se debe convertir esa diferencia de 43 commits en un plan de release por lotes verificables, con prioridad por valor/riesgo.

### WEBSITE

`iberfit.cl` LIVE no coincide con `iberfit/iberfitweb@main` al checkpoint 2026-09-02. No desplegar ese `main` sobre LIVE hasta recuperar la fuente exacta actualmente servida.

### GROWTH

Puede avanzar en paralelo mediante análisis, funnel, SEO/CRO, oferta y métricas. No debe depender de desplegar primero todos los cambios de app.

### QA / SECURITY

Auditoría incremental frecuente + auditoría profunda semanal. Prioridad: regresiones reales, auth/RLS/roles, cross-tenant, disponibilidad y cambios de artefacto.

## Bloqueos / riesgos actuales

### P0

Ningún P0 técnico nuevo queda abierto por el checkpoint Canary final, pero producción real obliga a mantener P0=0 continuamente. Cualquier fuga cross-tenant, bypass auth/RLS/WebAuthn, corrupción de datos o indisponibilidad crítica se convierte en P0 inmediato.

### P1

1. Diseñar el tren de promoción de los 43 commits LIVE→Canary; no promover masivamente.
2. Mantener un carril hotfix desde LIVE para incidencias reales de usuarios.
3. Completar QA real de Cliente / Coach / Admin sobre las funcionalidades que se elijan para cada lote de promoción.
4. Resolver deuda de ramas/PRs antiguos sin reintroducir código ya superado.
5. Recuperar la fuente exacta de `iberfit.cl` LIVE.
6. Resolver explícitamente la gobernanza/visibilidad del repositorio.

## Condición de GO para cualquier release productivo

- identificar SHA LIVE actual justo antes del trabajo;
- identificar SHA candidato exacto;
- diff acotado y entendido;
- CI verde;
- Canary/QA exacto y autenticado;
- roles/tenant/auth/RLS/WebAuthn según riesgo;
- revisión visual/UX proporcional;
- migraciones separadas y explícitas si existen;
- rollback comprobable;
- evidencia retenida;
- ventana/impacto sobre usuarios reales evaluado;
- comprobación post-deploy de artefacto y rutas críticas;
- ninguna mutación accidental de PROD.

## Siguiente acción exacta

1. Mantener `9cbe3ad...` como checkpoint Canary certificado; no seguir moviendo Canary sin una tarea concreta.
2. Adoptar `docs/OPERATING_MODEL.md`, `docs/CODEX_WORKFLOW.md` y `docs/RELEASE_POLICY.md` como forma diaria de trabajo.
3. Inventariar los 43 commits en lotes de promoción seguros, sin desplegar todavía.
4. En paralelo, continuar recuperación de la web LIVE y preparar Growth sin bloquearse por la app.
5. Cada duda/bug observado por el propietario en `app.iberfit.cl` entra por triage: LIVE BUG, PRODUCT IMPROVEMENT, UX, DATA/SECURITY o GROWTH, y sólo entonces se asigna al carril correcto.
