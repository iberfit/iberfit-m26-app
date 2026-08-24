import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const pkg=JSON.parse(read('package.json'));

test('RC64.2A pins direct Lighthouse dev-only while runtime dependency count stays zero',()=>{
  assert.equal(pkg.dependencies,undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies||{}).sort(),['@playwright/test','axe-core','lighthouse']);
  assert.equal(pkg.devDependencies['@playwright/test'],'1.62.1');
  assert.equal(pkg.devDependencies['axe-core'],'4.12.1');
  assert.equal(pkg.devDependencies['lighthouse'],'13.4.1');
  assert.equal(pkg.devDependencies['@lhci/cli'],undefined);
});

test('RC64.2A quality scripts build a dedicated current-source QA surface',()=>{
  assert.equal(pkg.scripts['quality:rc64:real-shell'],'node qa/rc64/build-current-surface.mjs && playwright test --config playwright.real-shell.config.mjs');
  assert.equal(pkg.scripts['quality:rc64:performance'],'node qa/rc64/build-current-surface.mjs && node qa/rc64/run-lighthouse.mjs');

  const builder=read('qa/rc64/build-current-surface.mjs');
  assert.match(builder,/\.tmp','rc64-current-surface/u);
  assert.match(builder,/\['public\/m26','m26'\]/u);
  assert.match(builder,/\['src\/m26','src\/m26'\]/u);
  assert.match(builder,/releaseCandidate:false/u);
  assert.match(builder,/historicalReleaseBudgetsApplied:false/u);
  assert.match(builder,/RC64_2A_QA_RUNTIME_MUST_FAIL_CLOSED/u);
  assert.match(builder,/RC64_2A_QA_SHELL_CSS_NOT_CANONICAL/u);
});

test('RC64.2A QA surface is distinct from historical RC15 and RC29 release builders',()=>{
  const historical=JSON.parse(read('dist/m26-launch-candidate/version.json'));
  assert.equal(historical.version,'26.0.0-launch-candidate.15');

  const rc29Builder=read('scripts/build_rc29_prepublication_candidate.mjs');
  assert.match(rc29Builder,/JAVASCRIPT_LIMIT/u);
  assert.match(rc29Builder,/CORE_TOTAL_LIMIT/u);

  const budget=read('lighthouserc.cjs');
  const server=read('qa/rc64/real-shell-server.mjs');
  assert.match(budget,/target:'\.tmp\/rc64-current-surface'/u);
  assert.match(server,/\.tmp','rc64-current-surface/u);
  assert.doesNotMatch(`${budget}\n${server}`,/m26-launch-candidate|m26-prepublicacion-infraestructura-candidate/u);
});



test('RC64.2A disabled runtime uses one CSP-hash critical style and does not fetch full-app styles before elevation',()=>{
  const index=read('public/m26/index.html');
  const entry=read('public/m26/app.js');
  const critical=read('public/m26/preauth-critical.css').replace(/\n+$/u,'');
  const headers=read('public/m26/_headers');

  assert.doesNotMatch(index,/href="\/m26\/preauth-critical\.css"/u);
  const inline=[...index.matchAll(/<style data-iberfit-preauth-critical>([\s\S]*?)<\/style>/gu)];
  assert.equal(inline.length,1);
  assert.equal([...index.matchAll(/<style\b/giu)].length,1);
  assert.equal(inline[0][1],critical);

  const expectedHash=`'sha256-${createHash('sha256').update(Buffer.from(inline[0][1],'utf8')).digest('base64')}'`;
  const cspLine=headers.split('\n').find((line)=>line.includes('Content-Security-Policy:'))||'';
  const styleSource=cspLine.match(/style-src\s+([^;]+);/u)?.[1]||'';
  const tokens=styleSource.trim().split(/\s+/u).filter(Boolean);
  assert.ok(tokens.includes("'self'"));
  assert.ok(tokens.includes(expectedHash));
  assert.equal(tokens.filter((token)=>/^'sha256-[^']+'$/u.test(token)).length,1);
  assert.ok(!tokens.includes("'unsafe-inline'"));
  assert.doesNotMatch(index,/rel="preload" href="\/m26\/fonts\/inter-latin-wght-normal\.woff2"/u);

  const deferred=[...index.matchAll(/<link[^>]*data-href="[^"]+\.css"[^>]*data-iberfit-full-style[^>]*media="not all"[^>]*>/gu)];
  assert.equal(deferred.length,13);

  for(const stylePath of [
    '/src/m26/design/tokens.css',
    '/src/m26/design/typography.css',
    '/src/m26/design/icons.css',
    '/src/m26/shell/shell.css',
    '/src/m26/workflows/iri-external-report.css',
    '/src/m26/ui/client-bottom-nav.css',
    '/src/m26/rc39/rc39.css',
    '/src/m26/communication/communication.css',
    '/src/m26/admin/admin.css',
    '/src/m26/rc42/rc42.css',
    '/src/m26/rc44/rc44.css',
    '/src/m26/design/primitives.css',
    '/src/m26/design/role-surfaces.css',
  ]){
    const escaped=stylePath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const tag=index.match(new RegExp(`<link[^>]*data-href="${escaped}"[^>]*data-iberfit-full-style[^>]*media="not all"[^>]*>`,'u'))?.[0]||'';
    assert.ok(tag,`FULL_STYLE_DECLARATION_MISSING:${stylePath}`);
    assert.doesNotMatch(tag,/(?:^|\s)href=/u);
  }

  assert.match(index,/data-static-auth-bootstrap="true"/u);
  assert.doesNotMatch(index,/src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(index,/<button[\s\S]*?disabled[\s\S]*?aria-disabled="true"[\s\S]*?>[\s\S]*?Entrar[\s\S]*?<\/button>/u);
  assert.match(index,/El acceso no está disponible temporalmente en este sitio\./u);

  assert.doesNotMatch(entry,/^import\s+\{createM26Application\}/mu);
  assert.match(entry,/if\(runtime\.enabled\)\{\s*await loadFullApplication\(\);/u);
  assert.doesNotMatch(index,/href="\/src\/m26\/design\/adaptive-layout\.css"/u);
  assert.match(entry,/const pendingHref=link\.getAttribute\('data-href'\)/u);
  assert.match(entry,/const activeHref=link\.getAttribute\('href'\)/u);
  assert.match(entry,/if\(!activeHref\)link\.setAttribute\('href',targetHref\)/u);
  assert.match(entry,/M26_STYLE_HREF_REQUIRED/u);
  assert.match(entry,/function ensureAdaptiveLayoutStyle\(\)/u);
  assert.match(entry,/link\.href='\/src\/m26\/design\/adaptive-layout\.css'/u);
  assert.match(entry,/ensureAdaptiveLayoutStyle\(\);\s*await activateFullStyles\(\);/u);
  assert.match(entry,/await import\('\/src\/m26\/app\/application\.js'\)/u);
  assert.match(entry,/link\.media='all'/u);
  assert.match(entry,/M26_STYLE_LOAD_TIMEOUT/u);
  assert.match(entry,/M26_BACKEND_DISABLED/u);

  assert.match(critical,/\.m26-auth-page/u);
  assert.match(critical,/\.m26-auth-card/u);
  assert.match(critical,/min-height:44px/u);
  assert.match(critical,/max-width:100%/u);
});

test('RC64.2A initial HTML provides the settled disabled preauth shell before optional full-app elevation',()=>{
  const index=read('public/m26/index.html');
  const entry=read('public/m26/app.js');

  assert.match(index,/data-static-auth-bootstrap="true"/u);
  assert.match(index,/aria-busy="false"/u);
  assert.match(index,/Entrenamiento personal con criterio/u);
  assert.match(index,/Diagnóstico, planificación, control y seguimiento\./u);
  assert.match(index,/data-auth-form="login"/u);
  assert.match(index,/type="submit"[\s\S]*?disabled[\s\S]*?aria-disabled="true"[\s\S]*?>[\s\S]*?Entrar/u);
  assert.match(index,/El acceso no está disponible temporalmente en este sitio\./u);
  assert.doesNotMatch(index,/Preparando acceso seguro…/u);
  assert.doesNotMatch(index,/src="\/public\/isotipo-iberfit\.png"/u);
  assert.doesNotMatch(index,/rel="preload" href="\/m26\/fonts\/inter-latin-wght-normal\.woff2"/u);

  const staticIndex=index.indexOf('data-static-auth-bootstrap="true"');
  const moduleIndex=index.indexOf('<script type="module" src="/m26/app.js"></script>');
  assert.ok(staticIndex>=0&&moduleIndex>staticIndex);

  assert.doesNotMatch(entry,/^import\s+\{createM26Application\}/mu);
  assert.match(entry,/if\(runtime\.enabled\)\{\s*await loadFullApplication\(\);/u);
  assert.match(entry,/await import\('\/src\/m26\/app\/application\.js'\)/u);
});
test('RC64.2A current source contains RC28 mobile auth containment missing in historical RC15',()=>{
  const current=read('src/m26/shell/shell.css');
  const historical=read('dist/m26-launch-candidate/src/m26/shell/shell.css');
  assert.match(current,/\.m26-auth-page, \.m26-auth-page \* \{ box-sizing: border-box; \}/u);
  assert.match(current,/\.m26-auth-card \{ max-width: 100%; overflow-wrap: anywhere; \}/u);
  assert.doesNotMatch(historical,/\.m26-auth-page, \.m26-auth-page \* \{ box-sizing: border-box; \}/u);
});

test('RC64.2A Lighthouse budget contract uses three median lab runs on current-source QA surface',()=>{
  const config=read('lighthouserc.cjs');
  assert.match(config,/iberfit\.rc64\.2a\.lighthouse-budget\.v1/u);
  assert.match(config,/target:'\.tmp\/rc64-current-surface'/u);
  assert.match(config,/runs:3/u);
  assert.match(config,/performanceScoreMin:0\.80/u);
  assert.match(config,/lcpMaxMs:2500/u);
  assert.match(config,/clsMax:0\.10/u);
  assert.match(config,/tbtMaxMs:300/u);
  assert.doesNotMatch(config,/upload|temporary-public-storage/iu);
});

test('RC64.2A programmatic Lighthouse tolerates transient Windows DevTools port locks',()=>{
  const runner=read('qa/rc64/run-lighthouse.mjs');
  assert.match(runner,/import os from 'node:os'/u);
  assert.match(runner,/import lighthouse from 'lighthouse'/u);
  assert.match(runner,/chromium\.executablePath\(\)/u);
  assert.match(runner,/--remote-debugging-port=0/u);
  assert.match(runner,/async function readDevToolsPort/u);
  assert.match(runner,/\['ENOENT','EBUSY','EPERM','EACCES'\]\.includes/u);
  assert.match(runner,/DevToolsActivePort/u);
  assert.match(runner,/path\.join\(os\.tmpdir\(\),'iberfit-rc64-lighthouse-profiles'\)/u);
  assert.match(runner,/await lighthouse\(url,\{/u);
  assert.match(runner,/port:session\.port/u);
  assert.match(runner,/RC64_2A_PROFILE_CLEANUP_DEFERRED/u);
  assert.match(runner,/largest-contentful-paint/u);
  assert.match(runner,/cumulative-layout-shift/u);
  assert.match(runner,/total-blocking-time/u);
  assert.match(runner,/function median/u);
  assert.match(runner,/RC64_2A_LIGHTHOUSE_BUDGET=PASS/u);
  assert.doesNotMatch(runner,/lighthouse','cli','index\.js|CHROME_PATH|chrome-launcher|@lhci|temporary-public-storage/iu);
});


test('RC64.2A real-shell inherits the explicit RC23 es-ES locale contract',()=>{
  const rc23=read('tests/m26_rc23_castellano_ui.test.mjs');
  const index=read('public/m26/index.html');
  const manifest=JSON.parse(read('public/m26/manifest.webmanifest'));
  const spec=read('qa/rc64/real-shell.spec.mjs');

  assert.match(rc23,/RC23 fija castellano de España en documento, PWA y utilidades/u);
  assert.match(rc23,/IBERFIT_UI_LOCALE,'es-ES'/u);
  assert.match(index,/<html lang="es-ES">/u);
  assert.equal(manifest.lang,'es-ES');
  assert.match(spec,/toHaveAttribute\('lang','es-ES'\)/u);
  assert.doesNotMatch(spec,/toHaveAttribute\('lang','es-CL'\)/u);
});test('RC64.2A responsive contract protects desktop tablet and mobile real surfaces',()=>{
  const qualityConfig=read('playwright.config.mjs');
  const realConfig=read('playwright.real-shell.config.mjs');
  const authConfig=read('playwright.authenticated.config.mjs');
  const spec=read('qa/rc64/real-shell.spec.mjs');

  assert.match(qualityConfig,/desktop-chromium[\s\S]*1440[\s\S]*1000/u);
  assert.match(qualityConfig,/tablet-chromium[\s\S]*1024[\s\S]*1366/u);
  assert.match(qualityConfig,/mobile-chromium[\s\S]*390[\s\S]*844/u);

  assert.match(realConfig,/real-shell-desktop-chromium[\s\S]*1440[\s\S]*1000/u);
  assert.match(realConfig,/real-shell-tablet-chromium[\s\S]*1024[\s\S]*1366/u);
  assert.match(realConfig,/real-shell-mobile-chromium[\s\S]*390[\s\S]*844/u);

  assert.match(authConfig,/authenticated-readonly-chromium[\s\S]*1440[\s\S]*1000/u);
  assert.match(authConfig,/authenticated-readonly-tablet-chromium[\s\S]*1024[\s\S]*1366/u);
  assert.match(authConfig,/authenticated-readonly-mobile-chromium[\s\S]*390[\s\S]*844/u);

  assert.match(spec,/pageerror/u);
  assert.match(spec,/requestfailed/u);
  assert.match(spec,/externalRequests/u);
  assert.match(spec,/documentElement\.scrollWidth/u);
  assert.match(spec,/toBeLessThanOrEqual\(layout\.viewportWidth\+1\)/u);
  assert.match(spec,/runtimeEnabled\)\.toBe\(false\)/u);
  assert.match(spec,/appMounted\)\.toBe\(true\)/u);
});

test('RC64.2A security closeout preserves LHCI provenance without keeping vulnerable wrapper',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  const evidence=read('docs/evidence/rc64-2/RC64_2A_PERFORMANCE_REAL_SHELL_FOUNDATION_20260817.md');
  assert.match(evidence,/10 vulnerabilidades:/u);
  assert.match(evidence,/7 high/u);
  assert.match(roadmap,/@lhci\/cli 0\.15\.1.*descarta/u);
  assert.match(roadmap,/npm audit --audit-level=high/u);
  assert.doesNotMatch(`${read('package.json')}\n${read('package-lock.json')}`,/"@lhci\/cli"/u);
});

test('RC64.2A records legacy builder budget failure without weakening historical budgets',()=>{
  const evidence=read('docs/evidence/rc64-2/RC64_2A_PERFORMANCE_REAL_SHELL_FOUNDATION_20260817.md');
  assert.match(evidence,/3\.261\.922 bytes/u);
  assert.match(evidence,/233\.775 bytes/u);
  assert.match(evidence,/4\.609\.085 bytes/u);
  assert.match(evidence,/850\.000/u);
  assert.match(evidence,/155\.000/u);
  assert.match(evidence,/3\.700\.000/u);
  assert.match(evidence,/no se elevan/u);
});

test('RC64.2A does not fabricate field Core Web Vitals or platform-dependent visual baselines',()=>{
  const evidence=read('docs/evidence/rc64-2/RC64_2A_PERFORMANCE_REAL_SHELL_FOUNDATION_20260817.md');
  assert.match(evidence,/laboratorio/u);
  assert.match(evidence,/INP/u);
  assert.match(evidence,/p75/u);
  assert.match(evidence,/Linux reproducible/u);
  assert.match(evidence,/toHaveScreenshot/u);
  assert.match(evidence,/RC64\.2B/u);
  assert.doesNotMatch(read('qa/rc64/real-shell.spec.mjs'),/toHaveScreenshot/u);
});

test('RC64.2A CI and roadmap keep Quality Platform open for authenticated visual observability closeout',()=>{
  const ci=read('.github/workflows/ci.yml');
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(ci,/npm run quality:rc64:browser/u);
  assert.match(ci,/npm run quality:rc64:real-shell/u);
  assert.match(ci,/npm run quality:rc64:performance/u);
  assert.match(roadmap,/RC64_2A=CLOSED_PERFORMANCE_REAL_SHELL_FOUNDATION/u);
  assert.match(roadmap,/RC64_2B=IN_PROGRESS_VISUAL_AUTH_OBSERVABILITY_CLOSEOUT/u);
  assert.match(roadmap,/RC64=IN_PROGRESS_QUALITY_PLATFORM/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
});

test('RC64.2A keeps generated QA surface and Lighthouse machine output ignored',()=>{
  const ignore=read('.gitignore');
  assert.match(ignore,/^\.tmp\/$/mu);
  assert.match(ignore,/^\.lighthouseci\/$/mu);
});
test('RC64.2A PWA app-shell retains canonical critical CSS after inline boot optimization',()=>{
  const generator=read('scripts/generate_rc58_app_shell.mjs');
  const index=read('public/m26/index.html');
  const sw=read('public/m26/sw.js');

  assert.equal(index.includes('href="/m26/preauth-critical.css"'),false);
  assert.equal(index.includes('<style data-iberfit-preauth-critical>'),true);
  assert.equal(generator.includes('function linkedStylesFromIndex()'),true);
  assert.equal(generator.includes('for(const repoPath of trackedFiles())'),true);
  assert.equal(generator.includes('repoPaths.add(repoPath)'),true);
  assert.equal(generator.includes('RC58_5C_B_LINKED_CSS_PATH_UNMAPPED'),true);
  assert.equal(generator.includes('RC58_5C_B_LINKED_STYLE_MISSING'),true);
  assert.equal(generator.includes('for(const linkedStyle of linkedStylesFromIndex())'),true);
  assert.equal(sw.includes('"/m26/preauth-critical.css"'),true);
  assert.equal(sw.includes("VERSION='m26-rc63-2'"),true);
  assert.equal(sw.includes("PREVIOUS_VERSION='m26-rc63-1'"),true);
});

test('RC64.2A direct Lighthouse Chromium launch disables sandbox only on GitHub Linux loopback',async()=>{
  const policy=await import('../qa/rc64/chromium-launch-policy.mjs');

  assert.equal(
    policy.RC64_2A_CHROMIUM_LAUNCH_POLICY_SCHEMA,
    'iberfit.rc64.2a.chromium-launch-policy.v1',
  );

  assert.deepEqual(
    policy.managedChromiumSandboxArgs({
      platform:'linux',
      githubActions:'true',
      host:'127.0.0.1',
    }),
    ['--no-sandbox'],
  );

  assert.deepEqual(
    policy.managedChromiumSandboxArgs({
      platform:'linux',
      githubActions:'false',
      host:'127.0.0.1',
    }),
    [],
  );

  assert.deepEqual(
    policy.managedChromiumSandboxArgs({
      platform:'win32',
      githubActions:'true',
      host:'127.0.0.1',
    }),
    [],
  );

  assert.throws(
    ()=>policy.managedChromiumSandboxArgs({
      platform:'linux',
      githubActions:'true',
      host:'0.0.0.0',
    }),
    /RC64_2A_GITHUB_LINUX_NO_SANDBOX_REQUIRES_IPV4_LOOPBACK/u,
  );

  const runner=read('qa/rc64/run-lighthouse.mjs');
  assert.match(runner,/managedChromiumSandboxArgs\(\{host:contract\.host\}\)/u);
  assert.match(runner,/contract\.host==='127\.0\.0\.1'/u);
  assert.match(runner,/--disable-background-networking/u);
});

test('RC64.2A adaptive device matrix covers compact medium expanded touch and pointer',()=>{
  const realConfig=read('playwright.real-shell.config.mjs');
  const authConfig=read('playwright.authenticated.config.mjs');
  const adaptive=read('src/m26/design/adaptive-layout.css');

  assert.match(realConfig,/real-shell-mobile-small-chromium[\s\S]*360[\s\S]*800/u);
  assert.match(realConfig,/real-shell-mobile-chromium[\s\S]*390[\s\S]*844/u);
  assert.match(realConfig,/real-shell-tablet-chromium[\s\S]*1024[\s\S]*1366/u);
  assert.match(realConfig,/real-shell-tablet-landscape-chromium[\s\S]*1366[\s\S]*1024/u);
  assert.match(realConfig,/real-shell-laptop-chromium[\s\S]*1366[\s\S]*768/u);
  assert.match(realConfig,/real-shell-desktop-chromium[\s\S]*1440[\s\S]*1000/u);

  assert.match(authConfig,/authenticated-readonly-tablet-chromium/u);
  assert.match(authConfig,/authenticated-readonly-tablet-landscape-chromium/u);

  assert.match(adaptive,/compact-touch/u);
  assert.match(adaptive,/medium-touch/u);
  assert.match(adaptive,/expanded-touch/u);
  assert.match(adaptive,/expanded-pointer/u);
  assert.match(adaptive,/data-m26-expediente-view/u);
});
test('RC64.2A fullscreen device canvas is a permanent product contract',()=>{
  const adaptive=read('src/m26/design/adaptive-layout.css');

  assert.match(adaptive,/IBERFIT · Fullscreen Device Canvas/u);
  assert.match(adaptive,/\.m26-shell[\s\S]*min-height:\s*100dvh/u);
  assert.match(adaptive,/\.m26-workspace[\s\S]*min-height:\s*100dvh/u);
  assert.match(adaptive,/compact-touch[\s\S]*\.m26-mobile-nav[\s\S]*left:\s*0\s*!important/u);
  assert.match(adaptive,/safe-area-inset-bottom/u);
});