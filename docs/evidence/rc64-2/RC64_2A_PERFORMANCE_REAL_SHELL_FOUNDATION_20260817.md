# RC64.2A — Performance & Real-shell Quality Foundation

Fecha: 2026-08-17

## Failure provenance

RC64.2A fue fail-closed de forma útil durante su implantación:

1. se corrigió una expectativa de copy que mezclaba generaciones del shell;
2. `@lhci/cli@0.15.1` reportó 10 vulnerabilidades: 2 low, 1 moderate y 7 high,
   por lo que se descartó antes del commit;
3. el artefacto histórico RC15 mostró overflow móvil de 394 px en viewport 390 px;
4. al retargetear a `build:rc29`, el builder histórico abortó antes de Playwright
   porque sus budgets de empaquetado ya no representan el árbol canónico actual.

En V6, el builder RC29 midió:

- JavaScript: 3.261.922 bytes frente a límite histórico 850.000;
- CSS: 233.775 bytes frente a límite histórico 155.000;
- core: 4.609.085 bytes frente a límite histórico 3.700.000.

Esos límites históricos no se elevan para hacer pasar RC64.2A.

## Superficie QA actual

RC64.2A no se hace pasar por un release RC15, RC29 o RC40.

`qa/rc64/build-current-surface.mjs` construye una superficie QA efímera en
`.tmp/rc64-current-surface` copiando directamente los artefactos canónicos
necesarios:

- `public/m26`;
- `src/m26`;
- `baseline_m25_2/exercise-catalog-m25.json`;
- `public/isotipo-iberfit.png`.

La superficie se reconstruye antes de Playwright y antes de Lighthouse.
`.tmp/` está ignorado y el output no se versiona.

El builder QA verifica fail-closed:

- runtime `enabled: false`;
- `qaOnly: true`;
- paridad del `shell.css` generado con `src/m26/shell/shell.css`.

No se ejecutan ni se modifican budgets históricos de release.

## Seguridad

Se usa Lighthouse `13.4.1` directo y dev-only.

El cierre exige:

- `npm audit --omit=dev --audit-level=low`;
- `npm audit --audit-level=high`.

No se ejecuta `npm audit fix --force`, no existe upload externo y
`@lhci/cli` no queda instalado.

## Performance de laboratorio

Lighthouse usa Chromium de Playwright y ejecuta tres mediciones sobre la
superficie QA actual. Se agrega por mediana:

- performance score >= 0.80;
- LCP <= 2500 ms;
- CLS <= 0.10;
- TBT <= 300 ms.

Son resultados de laboratorio. No demuestran p75 real y TBT no se presenta
como INP.

## Real-shell smoke

Playwright abre la misma superficie QA actual en:

- desktop 1440x1000;
- mobile 390x844.

Son gates:

- `pageerror`;
- `console.error`;
- requests fallidas;
- requests externas inesperadas;
- overflow horizontal estricto;
- aplicación no montada;
- runtime deshabilitado incoherente;
- warning pre-auth ausente.

La fuente canónica contiene la contención móvil RC28:
`box-sizing: border-box`, `max-width: 100%` y `overflow-wrap: anywhere`.


## Windows Chromium lifecycle

V10 cerró el real-shell en desktop y mobile, incluido el gate de overflow, y
falló después al iniciar Lighthouse por una condición de lifecycle del launcher:
`chrome-launcher` lanzó `EPERM` al intentar borrar `%LOCALAPPDATA%\Temp\lighthouse.*`.

Eso no fue un incumplimiento de performance ni de los budgets RC64.2A.

RC64.2A pasa a la API Node de Lighthouse con Chrome gestionado explícitamente:

- el binario sigue siendo `chromium.executablePath()` de Playwright;
- RC64 inicia Chromium con `--remote-debugging-port=0`;
- lee `DevToolsActivePort` del perfil efímero;
- pasa ese `port` a `lighthouse()` programáticamente;
- cada ejecución usa un perfil independiente bajo `.tmp/rc64-lighthouse-profiles`;
- Chrome se termina antes del cleanup;
- un bloqueo tardío del sistema operativo al borrar ese perfil ignorado se
  registra como `RC64_2A_PROFILE_CLEANUP_DEFERRED`, sin convertir una medición
  ya válida en un falso fallo de budget.

No se cambia Lighthouse `13.4.1`, no se relajan métricas y no se incorpora
`chrome-launcher` como dependencia o API directa del runner RC64.

## DevToolsActivePort lock hardening

V11 cerró de nuevo el real-shell y llegó a Lighthouse programático. La segunda
ejecución falló antes de medir porque Windows devolvió `EBUSY` al abrir
`DevToolsActivePort` dentro de `.tmp` bajo el repositorio sincronizado por
OneDrive.

Eso tampoco fue un incumplimiento de los budgets.

El lifecycle se endurece sin cambiar métricas:

- los perfiles Chromium se crean bajo `os.tmpdir()` y no dentro de OneDrive;
- desaparece el patrón `existsSync` seguido de una lectura no protegida;
- `readDevToolsPort()` reintenta durante la ventana de arranque ante
  `ENOENT`, `EBUSY`, `EPERM` o `EACCES`;
- cualquier otro error de lectura sigue siendo fatal;
- el timeout de arranque y los budgets Lighthouse permanecen intactos.

## Genuine Lighthouse failure and initial pre-auth paint

V13 completed the three-run Lighthouse median and exposed the first genuine
performance failure of RC64.2A:

- performance score: 0.57 frente a mínimo 0.80;
- LCP: 13.847,5 ms frente a máximo 2.500 ms;
- CLS: 0,000392, dentro de 0,10;
- TBT: 48,5 ms, dentro de 300 ms.

El patrón es específico: CLS y TBT pasan, mientras el contenido principal aparece
demasiado tarde.

El documento canónico entregaba `<div id="app"></div>` vacío. El entrypoint
`public/m26/app.js` esperaba `createM26Application()` y después `app.mount()`;
por tanto el usuario no recibía el shell pre-auth hasta resolver el grafo de
módulos de la aplicación.

RC64.2A añade un bootstrap HTML crítico, no interactivo y sin datos de usuario:

- marca IBERFIT;
- claim aprobado;
- estado `Preparando acceso seguro…`;
- sin inputs ni acciones antes de que la aplicación esté montada.

`app.mount()` continúa siendo la autoridad funcional y sustituye ese contenido
al completar el arranque. No se cambian los budgets. Si este cambio no lleva el
LCP bajo 2.500 ms, RC64.2A seguirá bloqueado y el siguiente paso será perfilar y
dividir recursos render-blocking o el grafo de módulos, no rebajar el gate.

## Disabled-runtime fast path and critical CSS

V16 showed that the static bootstrap painted near 2.5 s, but the same H1 became
the LCP again at 13–15 s when the full module graph reached `app.mount()`.
Server latency and font display passed. The document also carried 13
render-blocking stylesheets with roughly 1.4–1.6 s of estimated savings.

RC64.2A therefore separates pre-auth bootstrap from the authenticated graph:

- `tokens.css` plus `preauth-critical.css` are the only initial blocking styles;
- the 12 application styles remain declared but use `media="not all"`;
- `public/m26/app.js` has no static import of `application.js`;
- disabled runtime keeps the complete non-interactive login shell already in
  the HTML and does not replace its H1 during startup;
- enabled runtime activates all full styles, waits for them, dynamically imports
  `application.js`, and only then mounts the complete app;
- the disabled shell can elevate to the full application lazily on the recovery
  action, preserving access to the existing recovery flow without paying the
  authenticated graph cost in the default disabled-runtime paint.

No performance budget is changed. Authenticated feature modules are not edited.

## Near-budget critical request-chain closeout

V20 showed the post-fast-path state was no longer CPU- or backend-bound:

- median performance score 0.93;
- median FCP about 1.04 s;
- median LCP 2.969 s, only 469 ms over the 2.5 s budget;
- median TBT 0 and CLS 0;
- run 3 already passed LCP at about 2.350 s;
- the H1 remained the LCP element;
- only `tokens.css` and `preauth-critical.css` remained render blocking;
- the preloaded Inter font transferred about 48 KiB before first paint;
- the preauth isotipo transferred about 37 KiB and Lighthouse estimated roughly
  36 KiB of image-delivery waste.

V21 makes the disabled preauth critical path self-contained:

- critical preauth CSS is inlined in the document;
- `tokens.css` joins the full-app deferred stylesheet set and is activated before
  authenticated application mount;
- the initial Inter preload is removed; the disabled shell uses system UI fonts
  and Georgia for the heading;
- the non-LCP isotipo is removed from the disabled preauth shell;
- authenticated module source files remain untouched;
- all performance budgets remain unchanged.

## CSP correction after the inline-critical experiment

The inline-critical experiment achieved the local performance objective but the
full historical regression correctly rejected it: the deployed header contract
does not allow `unsafe-inline` for `style-src`.

Final RC64.2A therefore keeps the performance improvements that are compatible
with the security contract:

- Inter is not preloaded on the disabled preauth path;
- the decorative preauth isotipo remains removed;
- `tokens.css` and the other application styles remain deferred until full-app
  elevation;
- critical preauth CSS is restored as exactly one same-origin external
  stylesheet;
- the RC16 no-inline-style guard is preserved unchanged;
- RC14 is aligned from a static absolute import to an absolute dynamic import;
- RC58.2 continues to require local font assets and no CDN, but no longer
  requires preloading Inter before authentication.

No CSP relaxation and no Lighthouse budget relaxation are introduced.

## PWA app-shell linked-CSS closeout

The CSP-safe critical stylesheet is a new file in the RC64.2A change set. The
historical app-shell generator previously derived its public inventory only from
`git ls-files`, so a valid newly linked CSS file could not enter `APP_SHELL`
until after staging or commit. Both RC41 and RC58.5c-b correctly detected the
gap.

The generator now keeps its tracked inventory and additionally reads
`public/m26/index.html`, accepts only same-origin `.css` mappings under `/m26/`,
`/src/`, or `/public/`, requires each mapped file to exist, and adds only those
linked styles to the generated shell. This makes pre-stage validation equivalent
to the committed result without broadening the generator to arbitrary untracked
files.

The service-worker release identity remains `m26-rc63-2` with
`m26-rc63-1` as its historical predecessor; RC64.2A does not rewrite the RC63.2
release-shell lineage. The service-worker script bytes and generated app-shell
inventory still change, so installation refreshes shell resources through the
existing `cache:'reload'` path.
## Visual y campo

Playwright ya ofrece `toHaveScreenshot`. Los goldens se difieren a RC64.2B
para generarlos y compararlos en Linux reproducible.

RC64.2A tampoco afirma Core Web Vitals de campo. El p75 y el INP reales
requieren RUM/observabilidad con política de datos explícita, también RC64.2B.


## Locale contract

El smoke V8 exigía `lang="es-CL"`, pero esa expectativa no pertenece al contrato
de IBERFIT. RC23 fija explícitamente castellano de España:

- `IBERFIT_UI_LOCALE = es-ES`;
- `public/m26/index.html` usa `lang="es-ES"`;
- `public/m26/offline.html` usa `lang="es-ES"`;
- `public/m26/manifest.webmanifest` declara `lang: es-ES`.

RC64.2A hereda ese contrato y corrige sólo el test. No se modifica la aplicación
para satisfacer una expectativa `es-CL` inventada por el smoke.
## Estado

- RC64.1: CLOSED.
- RC64.2A: CLOSED sólo si audits, target tests, real-shell, Lighthouse budgets y
  regresión completa pasan.
- RC64.2B: IN PROGRESS.
- RC64: IN PROGRESS.
- Premium Report Parity: REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL.
- Health Connect physical E2E: PENDING_ANDROID_DEVICE.
