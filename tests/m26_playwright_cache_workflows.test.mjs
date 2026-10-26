import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflows={
  device:read('.github/workflows/device-experience-gate.yml'),
  daily:read('.github/workflows/daily-use-visual-evidence.yml'),
  admin:read('.github/workflows/admin-interaction-matrix.yml'),
  remote:read('.github/workflows/remote-gates.yml'),
};

test('Playwright browser cache is lockfile-bound and preserves deterministic installs',()=>{
  for(const [name,workflow] of Object.entries(workflows)){
    if(name==='remote'){
    assert.match(workflow,/mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[0-9a-f]{64}/u,'remote: SHA-pinned Playwright image required');
    assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u);
    assert.match(workflow,/QA_BROWSER_MISSING/u,'remote: browser availability must fail closed');
    assert.match(workflow,/needs: prepare-ui/u,'remote: auth must depend on completed non-auth prep');
      assert.match(workflow,/npm ci/u,'remote: deterministic npm ci required');
      continue;
    }
    if(name==='admin'||name==='device'){
      // The same SHA-pinned browser image is already used by remote QA;
      // it prevents apt mirror stalls without dropping any device or engine.
      assert.match(workflow,/mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[0-9a-f]{64}/u,`${name}: pinned browser image required`);
      assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u,`${name}: browser path required`);
      assert.match(workflow,/npm ci/u,`${name}: deterministic install required`);
      assert.doesNotMatch(workflow,/playwright install-deps/u,`${name}: prevent network-dependent apt preparation`);
      continue;
    }
    assert.match(workflow,/actions\/cache@v4/u,`${name}: cache action missing`);
    assert.match(workflow,/~\/\.cache\/ms-playwright/u,`${name}: Playwright cache path missing`);
    assert.match(workflow,/hashFiles\('package-lock\.json'\)/u,`${name}: lockfile cache key missing`);
    assert.match(workflow,/npm ci/u,`${name}: deterministic npm ci missing`);
    assert.match(workflow,/playwright install-deps/u,`${name}: system dependency install missing`);
    assert.match(workflow,/cache-hit != 'true'/u,`${name}: cache-miss guard missing`);
    assert.doesNotMatch(workflow,/playwright install --with-deps/u,`${name}: browser download remains coupled to system deps`);
  }
});

test('Chromium-only visual and device gates remain fail-closed',()=>{
  for(const name of ['device','daily']){
    const workflow=workflows[name];
    assert.match(workflow,/chromium\.executablePath\(\)/u,`${name}: Chromium readiness check missing`);
    if(name==='daily'){
      assert.match(workflow,/playwright install-deps chromium/u,'daily: Chromium deps missing');
      assert.match(workflow,/playwright install chromium/u,'daily: Chromium miss install missing');
      assert.match(workflow,/-chromium/u,'daily: Chromium cache namespace missing');
    }else{
      assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u,'device: bundled Chromium required');
      assert.match(workflow,/device-experience-gate-phase-a/u);
      assert.doesNotMatch(workflow,/playwright install-deps/u,'device: redundant apt setup forbidden');
    }
  }
});

test('Admin browser shards preserve Chromium WebKit and Firefox independently',()=>{
  const workflow=workflows.admin;
  for(const browser of ['chromium','webkit','firefox']){
    assert.match(workflow,new RegExp(`browser: ${browser}`,'u'),`admin: ${browser} matrix entry missing`);
  }
  assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u,'admin: version-pinned browser path missing');
  assert.match(workflow,/PW_BROWSER: \$\{\{ matrix\.browser \}\}/u,'admin: per-browser readiness check missing');
  assert.match(workflow,/runuser -u pwuser -- npx playwright test/u,'admin: non-root Firefox sandbox required');
  assert.doesNotMatch(workflow,/playwright install-deps/u,'admin: apt mirror must not block release');
});

test('Remote gate preserves the full Chromium WebKit and Firefox bundle',()=>{
  const workflow=workflows.remote;
    assert.match(workflow,/mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[0-9a-f]{64}/u,'remote: SHA-pinned Playwright image required');
    assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u);
    assert.match(workflow,/QA_BROWSER_MISSING/u,'remote: browser availability must fail closed');
    assert.match(workflow,/needs: prepare-ui/u,'remote: auth must depend on completed non-auth prep');
    assert.match(workflow,/chromium,firefox,webkit/u,'remote: three browser readiness checks required');
});

test('Playwright cache optimization never caches node_modules',()=>{
  for(const [name,workflow] of Object.entries(workflows)){
    assert.doesNotMatch(workflow,/path:\s*(?:\.\/)?node_modules/u,`${name}: node_modules must not be cached`);
  }
});
