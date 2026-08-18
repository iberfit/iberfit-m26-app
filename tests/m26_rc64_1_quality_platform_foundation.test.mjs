import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  QUALITY_ROLES,
  QUALITY_STATES,
  RC64_QUALITY_FIXTURE_SCHEMA,
  renderQualityFixture,
} from '../qa/rc64/fixture.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const pkg=JSON.parse(read('package.json'));

test('RC64.1 pins Playwright and axe-core as exact dev-only quality dependencies',()=>{
  assert.equal(pkg.devDependencies?.['@playwright/test'],'1.62.1');
  assert.equal(pkg.devDependencies?.['axe-core'],'4.12.1');
  assert.equal(pkg.dependencies,undefined);
  assert.match(pkg.scripts?.['quality:rc64:browser']||'',/playwright test --config playwright\.config\.mjs/u);
  assert.match(pkg.scripts?.['quality:rc64:install-browser']||'',/playwright install chromium/u);
  assert.match(pkg.scripts?.['test:m26:rc64']||'',/m26_rc64_1_quality_platform_foundation\.test\.mjs/u);
});

test('RC64.1 fixture contract is deterministic across exactly three roles and seven states',()=>{
  assert.equal(RC64_QUALITY_FIXTURE_SCHEMA,'iberfit.quality-fixture.v1');
  assert.deepEqual(QUALITY_ROLES,['client','coach','admin']);
  assert.deepEqual(QUALITY_STATES,['normal','loading','empty','error','retry','conflict','offline']);
  for(const role of QUALITY_ROLES){
    for(const state of QUALITY_STATES){
      const html=renderQualityFixture({role,state});
      assert.match(html,new RegExp(`data-quality-role="${role}"`,'u'));
      assert.match(html,new RegExp(`data-quality-state="${state}"`,'u'));
    }
  }
});

test('RC64.1 fixture fails closed for unknown role and state',()=>{
  const html=renderQualityFixture({role:'superadmin',state:'success'});
  assert.match(html,/data-quality-role="client"/u);
  assert.match(html,/data-quality-state="normal"/u);
});

test('RC64.1 Playwright config defines desktop tablet and mobile Chromium projects',()=>{
  const config=read('playwright.config.mjs');
  assert.match(config,/name:'desktop-chromium'[\s\S]*1440[\s\S]*1000/u);
  assert.match(config,/name:'tablet-chromium'[\s\S]*1024[\s\S]*1366/u);
  assert.match(config,/name:'mobile-chromium'[\s\S]*390[\s\S]*844/u);
  assert.match(config,/node qa\/rc64\/static-server\.mjs 4173 127\.0\.0\.1/u);
  assert.doesNotMatch(config,/python -m http\.server/iu);
  assert.match(config,/trace:'retain-on-failure'/u);
  assert.match(config,/screenshot:'only-on-failure'/u);
});

test('RC64.1 local quality server is Node built-in only, serves public assets and fails closed outside allowed roots',()=>{
  const server=read('qa/rc64/static-server.mjs');
  assert.match(server,/from 'node:http'/u);
  assert.match(server,/from 'node:fs'/u);
  assert.match(server,/from 'node:path'/u);
  assert.match(server,/publicRoot=await fs\.realpath\(path\.join\(root,'public'\)\)/u);
  assert.match(server,/resolveFromBase\(root,rootPrefix,relative\)/u);
  assert.match(server,/rootResult\.status!==404/u);
  assert.match(server,/resolveFromBase\(publicRoot,publicRootPrefix,relative\)/u);
  assert.match(server,/candidate\.startsWith\(prefix\)/u);
  assert.match(server,/Cache-Control':'no-store'/u);
  assert.match(server,/X-Content-Type-Options':'nosniff'/u);
  assert.match(server,/request\.method!==['"]GET['"]&&request\.method!==['"]HEAD['"]/u);
  assert.match(server,/fs\.realpath/u);
  assert.doesNotMatch(server,/express|http-server|serve-handler|python|fetch\(/iu);

  const typography=read('src/m26/design/typography.css');
  assert.match(typography,/\/m26\/fonts\/inter-latin-wght-normal\.woff2/u);
  assert.match(typography,/\/m26\/fonts\/source-serif-4-latin-wght-normal\.woff2/u);
});
test('RC64.1 browser quality gate covers axe console network overflow touch and keyboard',()=>{
  const spec=read('qa/rc64/quality-platform.spec.mjs');
  assert.match(spec,/axe\.run/u);
  assert.match(spec,/wcag22aa/u);
  assert.match(spec,/pageerror/u);
  assert.match(spec,/requestfailed/u);
  assert.match(spec,/documentScrollWidth/u);
  assert.match(spec,/item\.width<44\|\|item\.height<44/u);
  assert.match(spec,/keyboard\.press\('Tab'\)/u);
  assert.match(spec,/toBeFocused/u);
});

test('RC64.1 quality fixture is explicitly synthetic and contains no backend or health payload',()=>{
  const files=[
    read('qa/rc64/fixture.html'),
    read('qa/rc64/fixture.css'),
    read('qa/rc64/fixture.js'),
    read('qa/rc64/quality-platform.spec.mjs'),
    read('playwright.config.mjs'),
    read('qa/rc64/static-server.mjs'),
  ].join('\n');
  assert.doesNotMatch(files,/supabase|service_role|commandBus|clientId|healthData|wearable|iriResults|fetch\(|XMLHttpRequest/iu);
  assert.match(files,/Fixture determinista sin identidad, salud ni backend/u);
});

test('RC64.1 CI installs exact lockfile and Chromium only for the RC58-64 feature rail',()=>{
  const ci=read('.github/workflows/ci.yml');
  assert.match(ci,/Preparar Quality Platform RC64/u);
  assert.match(ci,/npm ci/u);
  assert.match(ci,/npx playwright install --with-deps chromium/u);
  assert.match(ci,/npm run quality:rc64:browser/u);
  assert.match(ci,/feature\/rc58-design-system/u);
});

test('RC64.1 ignores browser-generated reports instead of committing machine artifacts',()=>{
  const ignore=read('.gitignore');
  assert.match(ignore,/^playwright-report\/$/mu);
  assert.match(ignore,/^test-results\/$/mu);
});

test('RC64.1 roadmap closes foundation without prematurely closing Quality Platform',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC63=CLOSED_EXERCISE_MEDIA_EXPERIENCE/u);
  assert.match(roadmap,/RC64=IN_PROGRESS_QUALITY_PLATFORM/u);
  assert.match(roadmap,/RC64_1=CLOSED_BROWSER_AXE_FOUNDATION/u);
  assert.match(roadmap,/RC64_2=IN_PROGRESS_VISUAL_PERFORMANCE_OBSERVABILITY/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});