# IBERFIT · Consolidación de PRs

Corte: 2026-09-02
Canary de comparación: `713a65a699c3bba277ef4bac1a16c634076da6db`

Objetivo: impedir merges acumulativos de ramas históricas parcialmente solapadas.

## Línea actual

### PR #38 · Admin/Coach UX + i18n

Rama: `feat/rc74-4-admin-coach-ux-i18n`

Comparación actual contra `canary/rc74-4`: **IDENTICAL**.

Conclusión: el contenido actual de esa rama ya coincide con Canary. No hay nada que ganar fusionándola de nuevo sobre Canary. La decisión pendiente es gobernanza/cierre del PR y promoción futura hacia la línea final sólo después de gates.

## Ramas antiguas divergentes con trabajo potencialmente rescatable

### PR #37 · RC75 auth/navigation audit

Rama: `audit/m26-total-20260901`

Estado vs Canary: divergida; nació de `74131c...`, muy anterior al Canary actual.

Cambios visibles únicos/diferentes en la comparación:

- `public/m26/index.html`;
- `src/m26/app/access-ui.js`;
- `src/m26/app/session-vault.js`;
- `src/m26/app/webauthn.js`;
- `src/m26/shell/navigation.js`;
- test RC75 de auth/navigation.

Acción: **no merge**. Comparar semánticamente cada cambio con Canary y rescatar sólo una mejora que falte y siga siendo compatible.

### PR #34 · auditoría profunda

Rama: `audit/deep-total-v2`

Estado: divergida y muy por detrás del Canary actual.

Contiene familia de auditoría continua/profunda, contratos de navegación y pequeños cambios de iconos/UI. El Canary actual ya posee auditoría continua en su propia línea, por lo que un merge completo tiene alto riesgo de duplicación/regresión.

Acción: comparar cobertura de scripts/tests, no commits. Incorporar únicamente checks faltantes.

### PR #30 · service worker ligado a release + rutas

Rama: `fix/prod-route-sw-contract-20260901`

Estado: divergida y muy por detrás.

Áreas a verificar contra Canary:

- workflow final production frontend;
- runtime config PROD;
- navegación;
- test de contrato de navegación.

Acción: revisar si el Canary actual ya sella la identidad de release/service worker. Si no, portar de forma mínima con tests actuales; no fusionar la rama.

### PR #26 · experiencia de instalación PWA

Rama: `improve/prod-pwa-install-20260831`

Estado: divergida y muy por detrás.

Trabajo potencial:

- UX `beforeinstallprompt`;
- guía iOS/macOS;
- `src/m26/platform/pwa.js`;
- tests de instalación.

Acción: evaluar primero la experiencia PWA del Canary actual. Portar sólo la parte aún ausente y útil.

### PR #25 · optimización RLS initplan

Rama: `audit/360-rls-performance-20260831`

Estado: divergida; contiene una migración SQL y test para 16 políticas detectadas históricamente.

Acción: **no aplicar a PROD desde el PR antiguo**. Reconsultar Performance Advisor/esquema actual en QA. Si el hallazgo persiste, generar una migración nueva contra el esquema vigente y validarla en QA.

## Ramas #24 / #31 / #35 / #36

Cubren parcialmente primer acceso, auth/session/WebAuthn, rutas y auditoría, con bases anteriores. Gran parte se solapa con #37/#38 y el Canary actual.

Acción: tratarlas como evidencia histórica. Sólo revisar si un test o comportamiento específico demuestra una capacidad que el Canary actual no tenga.

## Regla de consolidación

Para cada PR histórico:

1. comparar contra HEAD Canary actual;
2. identificar intención, no sólo diff;
3. ejecutar test que demuestre si la necesidad sigue abierta;
4. si sigue abierta, implementar de nuevo sobre HEAD actual o cherry-pick mínimo sólo si es inequívocamente seguro;
5. ejecutar regresión/gates;
6. cerrar el PR histórico con referencia a la solución actual.

Nunca fusionar ramas divergentes antiguas como atajo.

## Orden recomendado

1. resolver identidad/deploy del Canary live y obtener gate verde;
2. congelar un nuevo checkpoint Canary;
3. consolidar auth/session/WebAuthn (#37/#35/#36);
4. consolidar PWA/service worker (#26/#30);
5. revalidar RLS performance (#25) contra QA actual;
6. consolidar auditoría (#34) por cobertura;
7. cerrar PRs históricos ya absorbidos/superados.
