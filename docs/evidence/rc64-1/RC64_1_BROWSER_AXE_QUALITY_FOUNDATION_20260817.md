# RC64.1 — Browser & Accessibility Quality Foundation

Date: 2026-08-17
Status: CLOSED

## Objective

RC64.1 industrializes the first browser-quality layer without replacing the
existing RC test suite.

The foundation introduces pinned browser automation, automated WCAG checks,
deterministic role/state fixtures, viewport coverage and runtime-error gates.

RC64 remains open. Visual regression, Lighthouse/performance budgets,
production-like authenticated smoke coverage and the final runtime
observability contract continue in RC64.2.

## Dependencies

Dev-only pinned dependencies:

- `@playwright/test` 1.62.1;
- `axe-core` 4.12.1.

The product runtime receives no new dependency.

The deterministic fixture server uses only Node.js built-ins (`node:http`,
`node:fs` and `node:path`). RC64.1 therefore has no Python toolchain
requirement and adds no static-server package.

V9 proved the browser gate itself was working: the fixture failed closed on a
real 404 for `/m26/fonts/inter-latin-wght-normal.woff2`. The tracked font lives
under `public/m26/fonts/`, so the QA server now resolves repository-local QA
and source files first and falls back to `public/` for browser-facing public
asset URLs. No console/network error is allow-listed or suppressed.

Chromium is the first browser gate because RC64.1 is establishing the quality
platform and its deterministic matrix. Cross-browser expansion remains a
quality decision that can be added when it provides release value.

## Deterministic matrix

The synthetic quality fixture covers exactly:

Roles:
- Client;
- Coach;
- Admin.

States:
- normal;
- loading;
- empty;
- error;
- retry;
- conflict;
- offline.

Viewports:
- desktop 1440x1000;
- tablet 1024x1366;
- mobile 390x844.

The fixture contains no identity, health, IRI, wearable or backend payload.

Synthetic fixtures validate deterministic UI contracts; they do not replace
production-like smoke tests.

## Browser gates

Every role/state/project combination checks:

- WCAG A/AA rules through axe-core, including WCAG 2.2 AA tags;
- page errors;
- console errors;
- failed requests;
- horizontal overflow;
- minimum 44px interactive target geometry.

Every role also receives a keyboard path check on its normal state.

Invalid role/state input fails closed to Client/normal.

## CI

The existing `feature/rc58-design-system` CI rail now:

1. installs from the committed lockfile with `npm ci`;
2. installs Chromium with Playwright;
3. runs the existing UTF-8, app-shell and full Node regression gates;
4. runs the RC64 browser quality gate.

Playwright reports and failure artifacts remain local/CI artifacts and are not
committed.

## Safety

RC64.1 performs no:

- remote schema mutation;
- migration-history mutation;
- production data write;
- backend authorization change;
- automatic prescription change;
- clinical classification.

Premium Report Parity remains mandatory for all formal reports at the IRI
Premium reference level.

RC59.2 Health Connect physical E2E remains pending on a real Android device.

## Next

RC64.2 — Visual Regression, Performance & Runtime Observability.