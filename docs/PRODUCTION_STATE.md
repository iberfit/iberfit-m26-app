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
- Producción pública disponible con superficie IBERFIT de acceso restringido.
- SHA frontend histórico observado: `cb423a12402206a383d4174a168707b2d860c023`.
- Ese SHA no debe reutilizarse como identidad actual sin releer el proveedor/deployment live.
- Producción tiene usuarios reales y debe conservar continuidad de servicio y datos.

### Bloqueo de identidad frontend

El proyecto Pages productivo exacto y el deployment ID actualmente live de Cloudflare todavía no están recuperados desde evidencia de proveedor. No inferirlos a partir de nombres de repositorios, ramas históricas o proyectos Canary.

Antes de cualquier deploy frontend productivo hay que registrar:

1. proyecto Cloudflare Pages exacto;
2. deployment ID live;
3. dominios/rutas efectivas;
4. deployment anterior utilizable como rollback.

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
- ProductionSupabaseMutations = `0` durante la certificación Canary;
- MainTouched = `false`;
- AppCoachProductionDomainsTouched = `false`.

El contrato WebAuthn privilegiado queda validado fail-closed en este checkpoint. PR #41 fue cerrado correctamente mediante merge de la corrección antes de esta certificación.

## Supabase

### QA

- proyecto: `gjztkdwfmunnzhtvxrsu`;
- gate autenticado final: verde;
- aislamiento Cliente A/B: validado;
- WebAuthn privilegiado: fail-closed.

### PROD — estado read-only verificado

- proyecto: `pjhmrhejsoofmouedavw`;
- nombre observado: `iberfit-production`;
- estado: `ACTIVE_HEALTHY`;
- Postgres: 17;
- ninguna mutación fue necesaria para obtener este checkpoint.

La historia `supabase_migrations.schema_migrations` demuestra que producción ya contiene la secuencia productiva RC74.4/RC65/P0, desde al menos:

- `20260831163404 final_prod_01_rc74_4_least_privilege`

hasta:

- `20260831170443 final_prod_16_final_launch_p0_revoke_legacy_client_create`;
- `20260901012307 final_launch_p0_bootstrap_production_scope`;
- `20260901014205 audit360_optimize_auth_rls_initplan`;
- `20260902033214 p0_restore_primary_auth_read_bootstrap_v1`.

### Bundle SQL histórico retirado

El artifact `final-production-promotion-sql` del run `33656032685`, SHA-256 SQL `30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db`, fue contrastado contra producción en una transacción `READ ONLY`.

El preflight falló de forma segura con `FINAL_PROD_PREFLIGHT_PRE_4C_ROLE_DRIFT:9`. La lectura focal demostró que esos nueve contratos ya están exactamente en el postestado least-privilege que el bundle intentaba aplicar. La historia de migraciones confirma que el bundle parte de un baseline productivo anterior al estado actual.

Decisión: **ese bundle queda SUPERSEDED y NO debe ejecutarse, adaptarse ni forzarse**. Cualquier cambio futuro de base de datos debe generar sólo un delta nuevo desde el baseline productivo live.

PR #43 quedó cerrado sin merge después de convertir su ejecutor en fail-closed, documentar este hallazgo y pasar CI + auditoría. No se movió Canary.

### Edge Function WebAuthn productiva

Lectura actual:

- slug: `iberfit-webauthn-v1`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- RP ID visible: `iberfit.cl`;
- orígenes visibles: `https://app.iberfit.cl` y `https://coach.iberfit.cl`;
- contrato funcional visible: `final-production-free-webauthn-v1`.

La fuente live visible corresponde al mismo contrato productivo de la fuente del release certificado. No redeployar por rutina ni para “sincronizar” si no existe una diferencia real demostrada.

## Divergencia frontend LIVE ↔ Canary

El SHA frontend `cb423a...` es una observación histórica útil, no un deployment identity suficiente para una nueva promoción. Canary permanece certificado en `9cbe3ad...` y no debe moverse mientras se recupera el estado exacto de Cloudflare productivo.

La regla sigue siendo la misma: **no promover un conjunto masivo de commits sólo porque Canary esté verde**. Primero se recupera el deployment productivo real, se calcula el diff exacto y se diseña un lote reversible.

Desde ahora existen dos carriles de código:

1. **LIVE SUPPORT / HOTFIX**
   - para P0/P1 reales observados en producción;
   - nace del SHA/deployment LIVE exacto recuperado en el momento de la intervención;
   - cambio mínimo y aislado.

2. **PRODUCT EVOLUTION**
   - nace del Canary vigente;
   - contiene mejoras, UX, producto y nuevas capacidades;
   - se promociona en lotes deliberados, recertificados y reversibles.

Ver `docs/RELEASE_POLICY.md`.

## Trabajo activo

### APP / producto

Mantener Canary congelado en `9cbe3ad...` mientras se completa la identidad Cloudflare productiva. Las mejoras posteriores se evalúan en ramas separadas y se rescatan selectivamente, no mediante merges masivos.

### WEBSITE

`iberfit.cl` LIVE no coincide con `iberfit/iberfitweb@main` al checkpoint 2026-09-02. No desplegar ese `main` sobre LIVE hasta recuperar la fuente exacta actualmente servida.

### GROWTH

Puede avanzar en paralelo mediante análisis, funnel, SEO/CRO, oferta y métricas. No debe depender de desplegar primero todos los cambios de app.

### QA / SECURITY

Auditoría incremental frecuente + auditoría profunda semanal. Prioridad: regresiones reales, auth/RLS/roles, cross-tenant, disponibilidad y cambios de artefacto.

## Bloqueos / riesgos actuales

### P0

No existe un P0 técnico abierto derivado de la certificación Canary. Cualquier fuga cross-tenant, bypass auth/RLS/WebAuthn, corrupción de datos o indisponibilidad crítica se convierte en P0 inmediato.

### P1

1. Recuperar proyecto/deployment Cloudflare productivo exacto y rollback antes de cualquier promoción frontend.
2. Mantener `canary/rc74-4` fijo en `9cbe3ad...` mientras ese checkpoint esté pendiente.
3. Comparar PRs antiguos contra Canary y rescatar sólo piezas realmente ausentes.
4. Mantener el bundle SQL `33656032685` retirado; no reejecutarlo.
5. Completar QA real de Cliente / Coach / Admin sobre cada futuro lote de promoción.
6. Recuperar la fuente exacta de `iberfit.cl` LIVE por su carril web separado.
7. Resolver deuda de ramas/README/versionado y gobernanza sin mezclarla con el release.

## Condición de GO para cualquier release productivo

- identificar deployment/SHA LIVE actual justo antes del trabajo;
- identificar SHA candidato exacto;
- diff acotado y entendido;
- CI verde;
- Canary/QA exacto y autenticado;
- roles/tenant/auth/RLS/WebAuthn según riesgo;
- revisión visual/UX proporcional;
- cualquier delta DB generado desde el baseline productivo actual, nunca desde el bundle superseded;
- rollback comprobable del componente que se vaya a cambiar;
- evidencia retenida;
- ventana/impacto sobre usuarios reales evaluado;
- comprobación post-deploy de artefacto y rutas críticas;
- ninguna mutación accidental de PROD.

## Siguiente acción exacta

1. No mover `canary/rc74-4` de `9cbe3ad...`.
2. Recuperar de Cloudflare el proyecto Pages y deployment ID productivos actuales sin mutar producción.
3. En paralelo, clasificar PRs pendientes contra Canary en: ya incluido / superseded / pieza faltante / candidato post-release.
4. Mantener documentación HQ alineada con cada checkpoint comprobado.
5. No ejecutar el SQL histórico de `33656032685`.
