# IBERFIT · Production State

Última actualización documental: 2026-09-02
Estado de este archivo: checkpoint verificable, debe actualizarse cuando cambie rama/SHA/gates/deploy.

## Repositorio

- Canónico técnico: `iberfit/iberfit-m26-app`
- Visibilidad observada: public
- Rama por defecto observada: `prepublicacion/rc29`
- Nota de gobernanza: el README histórico afirma que el repositorio debería ser privado, pero la configuración observada es pública. No cambiar visibilidad automáticamente; resolver como decisión explícita de gobernanza.

## Canary

- Rama observada: `canary/rc74-4`
- HEAD observado: `444374e0c6cc6efb1d95f00dc7b138f261a23187`
- Commit: `ci: ejecutar gate autenticado read-only al actualizar canary`
- Fecha commit: 2026-09-02 11:15:59Z
- CI IBERFIT M26 sobre ese SHA: SUCCESS (run #315)
- Gate remoto read-only sobre ese SHA: FAILURE (run #62 / run id 33624566443)

Detalle del gate remoto fallido:

- preflight autenticado sin mutaciones: PASS;
- evidencia remota: PASS;
- preparación Playwright: PASS;
- validación Canary live en navegador real: PASS;
- evidencia Canary live: PASS;
- candidatos visuales Linux: PASS;
- smoke autenticado RC64.2B sobre fuente actual: FAIL;
- evidencia minimizada: conservada.

Por tanto: **NO interpretar el CI verde como autorización de producción.**

## Candidato final / prep

- Rama observada: `prep/final-production-rc74-4`
- HEAD observado: `824671972406bc98febaf1049ef7963f3dd571f9`
- Commit: `feat(ux): load premium role ergonomics`
- Fecha commit: 2026-09-02 04:31:17Z

## Trabajo activo relevante

PR #38 (draft): `feat: rediseñar Admin/Coach y añadir i18n ES/EN/FR/PT`

Incluye, según su descripción actual:

- navegación Admin reorganizada;
- navegación Coach reorganizada;
- work centers / accesos rápidos;
- bloqueos visuales seguros cuando falta cliente;
- idiomas ES/EN/FR/PT y región independiente;
- persistencia local idioma/región;
- responsive;
- PWA/shell premium;
- resiliencia de refresh y timeouts;
- contención de errores asíncronos;
- tests específicos;
- gate autenticado read-only.

El propio PR declara que no debe promoverse mientras el SHA servido por Canary live no coincida con el candidato esperado.

Otros PRs abiertos contienen auditorías, auth persistence, PWA install, route contracts y rendimiento RLS. Antes de reutilizarlos hay que comparar contra el HEAD actual para evitar reintroducir cambios antiguos o divergentes.

## Supabase

- Proyecto QA conocido: `gjztkdwfmunnzhtvxrsu`
- QA y producción deben permanecer separados.
- Producción: tratar como NO MUTABLE sin autorización explícita y preflight.
- Evidencia histórica reciente incluye gate de 52/52 comandos y aislamiento Cliente A/B, pero volver a ejecutar antes de cualquier promoción.

## Cloudflare / LIVE

Conocido por evidencia previa:

- proyecto Canary: `iberfit-m26-canary`;
- host Canary: `m26-canary.iberfit.cl`;
- aplicación productiva: `app.iberfit.cl`;
- producción y Canary no deben compartir artefacto o runtime config por accidente.

Estado operativo actual: existe evidencia de mismatch entre el candidato esperado y el SHA servido por Canary en uno de los gates recientes. Verificar artefacto desplegado antes de cualquier decisión de GO.

## Auditoría continua

Workflow: `.github/workflows/continuous-app-audit.yml`

Cobertura observada:

- regresión Node completa;
- contratos Cliente / Coach / Admin;
- auditoría integral read-only contra `https://app.iberfit.cl`;
- evidencia retenida 30 días;
- schedule cada 6 horas en el workflow observado.

No asumir que el schedule funciona sobre la rama deseada sólo por estar definido; verificar el default branch y el bridge de scheduler cuando se revise DevOps.

## Bloqueos actuales

### P0

- Ningún P0 funcional nuevo se declara como cerrado por este documento. Antes de producción se debe demostrar P0=0 mediante gates actuales.
- Cualquier cross-tenant, bypass de WebAuthn/rol, pérdida de datos, mutación accidental de PROD o discrepancia de artefacto se considera P0 inmediato.

### P1

1. Gate remoto del HEAD Canary no completamente verde: smoke autenticado falló.
2. Identidad del artefacto Canary live debe quedar alineada y demostrada con el SHA esperado.
3. Hay múltiples PRs abiertos y parcialmente solapados; riesgo de divergencia/reintroducción de cambios.
4. README/package metadata siguen anclados en RC29/RC38 en zonas del repo y no representan claramente RC74.4; deuda de documentación/versionado.
5. Visibilidad pública del repo contradice una regla histórica del README; requiere decisión de gobernanza, no automatismo.

## Condición de GO futura

No promover a producción hasta que, como mínimo:

- rama/SHA objetivo estén fijados;
- CI completo verde;
- gates remotos autenticados y read-only verdes;
- Canary live sirva exactamente el artefacto esperado;
- tests Cliente/Coach/Admin y aislamiento de rol pasen;
- auth/WebAuthn/RLS pasen;
- P0/P1 de release = 0 o exista excepción explícita documentada;
- rollback verificable;
- evidencia conservada;
- no haya mutaciones inesperadas de Supabase PROD.

## Siguiente acción exacta

1. Consolidar la documentación maestra en la rama `chore/iberfit-hq-bootstrap` sin tocar producción.
2. Después, auditar el fallo exacto del smoke autenticado del HEAD Canary y la identidad del artefacto live.
3. Sólo cuando el estado esté limpio, decidir qué PR activo es la línea de producto que debe continuar y cerrar/archivar duplicados de forma controlada.
