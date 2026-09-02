# IBERFIT · Production State

Última actualización documental: 2026-09-02
Estado: checkpoint verificable. Releer rama/SHA/gates antes de cualquier mutación.

## Repositorio

- Canónico técnico: `iberfit/iberfit-m26-app`
- Visibilidad observada: public
- Rama por defecto observada: `prepublicacion/rc29`
- Nota: el README histórico afirma que el repositorio debería ser privado, pero la configuración observada es pública. No cambiar visibilidad automáticamente; resolver como decisión explícita.

## Canary — estado más reciente observado

- Rama: `canary/rc74-4`
- HEAD: `713a65a699c3bba277ef4bac1a16c634076da6db`
- Commit: `test: alinear gate RC64.2B1 con smoke WebAuthn vigente`
- Fecha: 2026-09-02 13:18:14Z
- Padre directo: `a4f8bb0f22fd748cb84e20e349354f42ea06ed5d` (HEAD de PR #38 observado previamente)
- CI IBERFIT M26: SUCCESS, run #319 / id `33635146578`
- Gate remoto read-only: FAILURE, run #63 / id `33635146513`

### Gate remoto #63

PASS:

- setup/checkout/node;
- gate autenticado sin mutaciones;
- conservación de evidencia remota;
- preparación Playwright.

FAIL:

- `Validar Canary desplegado en navegador real`.

SKIP por fail-closed posterior:

- candidatos visuales Linux;
- smoke autenticado RC64.2B;

La evidencia autenticada conservada demuestra para Supabase QA:

- proyecto `gjztkdwfmunnzhtvxrsu`;
- modo `authenticated-readonly`;
- `mutationsPerformed=false`;
- `productionBlocked=true`;
- 52 comandos esperados / 52 remotos;
- registry validation OK, sin missing/unexpected/mismatches/duplicates;
- Coach: gate privilegiado WebAuthn devuelve `IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED` como se esperaba;
- Cliente A y Cliente B: aislamiento correcto, sin fingerprints extranjeros.

Interpretación actual: backend/gate autenticado QA pasa; el bloqueo inmediato está antes del smoke, en la validación del artefacto Canary desplegado. Evidencia reciente del PR activo lo describe como `PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH`.

**CI verde no equivale a GO. Canary live debe servir exactamente el candidato esperado.**

## Candidato / prep

- Rama: `prep/final-production-rc74-4`
- HEAD observado: `824671972406bc98febaf1049ef7963f3dd571f9`
- Commit: `feat(ux): load premium role ergonomics`
- Fecha: 2026-09-02 04:31:17Z

Comparación observada tras el avance de Canary: `canary/rc74-4` está por delante de `prep/final-production-rc74-4`; no promover prep por asumir que es más nuevo.

## PR activo principal

PR #38 (draft): `feat: rediseñar Admin/Coach y añadir i18n ES/EN/FR/PT`.

Su HEAD observado fue `a4f8bb0f22fd748cb84e20e349354f42ea06ed5d` y el Canary actual tiene ese SHA como padre directo, seguido por el commit de alineación del gate. Por tanto, la línea Canary actual incorpora el trabajo del PR #38 más el ajuste posterior del gate.

Incluye, según descripción del PR:

- navegación Admin y Coach reorganizada;
- centros de trabajo/accesos rápidos;
- estados seguros si falta cliente;
- ES/EN/FR/PT + región;
- responsive y PWA;
- resiliencia de refresh/timeouts;
- contención de errores asíncronos;
- tests específicos;
- gate autenticado read-only.

Otros PRs abiertos contienen auth persistence, PWA, route contracts, auditoría profunda y rendimiento RLS. No fusionar acumulativamente: comparar cada uno contra el Canary actual para rescatar sólo cambios que aún falten.

## Supabase

- QA conocido: `gjztkdwfmunnzhtvxrsu`
- QA y PROD separados.
- Producción: NO MUTAR sin autorización explícita + preflight + rollback.
- Última evidencia descargada del run #63: 52/52 comandos, aislamiento A/B correcto, WebAuthn privilegiado fail-closed, 0 mutaciones.

## Cloudflare / LIVE

Conocido:

- Canary project: `iberfit-m26-canary`;
- host: `m26-canary.iberfit.cl`;
- app productiva: `app.iberfit.cl`.

Bloqueo actual: el artefacto Canary live no está demostrando identidad con el SHA esperado por el gate. Se requiere alinear/desplegar el artefacto QA correcto y repetir el gate; no tocar producción para resolverlo.

## Auditoría continua

Workflow observado: `.github/workflows/continuous-app-audit.yml`.

Incluye:

- regresión Node completa;
- contratos Cliente/Coach/Admin;
- auditoría integral read-only contra `https://app.iberfit.cl`;
- artefactos 30 días;
- schedule declarado cada 6 horas.

Verificar siempre qué rama ejecuta realmente el scheduler y el bridge del default branch.

## WEBSITE — hallazgo separado

`iberfit.cl` LIVE y `iberfit/iberfitweb@main` no coinciden al 2026-09-02. La web live es más reciente/diferente que el `main` de junio. No desplegar desde ese `main` hasta recuperar la fuente exacta del LIVE. Ver `docs/website/WEBSITE_STATE.md`.

## Bloqueos actuales

### P0

No declarar P0=0 hasta recertificar release. Cualquier cross-tenant, bypass auth/WebAuthn/RLS, corrupción/pérdida de datos o mutación accidental de PROD bloquea inmediatamente.

### P1

1. Canary live no coincide aún con el candidato esperado por el gate.
2. Gate remoto #63 falla en validación del Canary desplegado.
3. Múltiples PRs abiertos parcialmente solapados requieren consolidación contra el Canary actual.
4. README/package metadata conservan referencias históricas RC29/RC38 y no describen claramente la línea actual.
5. Visibilidad pública del repositorio contradice una regla histórica del README y requiere decisión explícita.
6. Fuente Git conocida de `iberfit.cl` diverge del LIVE.

## Condición de GO futura

No promover hasta que:

- SHA objetivo fijo;
- CI completo verde;
- gate remoto completo verde;
- Canary live = artefacto/SHA esperado;
- Cliente/Coach/Admin + aislamiento de rol verdes;
- auth/WebAuthn/RLS verdes;
- P0/P1 de release cerrados o excepción explícita;
- rollback demostrado;
- evidencia conservada;
- PROD sin mutaciones inesperadas.

## Siguiente acción exacta

1. Mantener la consolidación documental aislada en `chore/iberfit-hq-bootstrap`.
2. Alinear el artefacto desplegado en `m26-canary.iberfit.cl` con el HEAD Canary actual y repetir gate #63 equivalente.
3. Tras gate verde, comparar PRs abiertos contra Canary y cerrar la divergencia sin reintroducir cambios obsoletos.
4. En paralelo, recuperar la fuente exacta de `iberfit.cl` LIVE antes de continuar la web.
