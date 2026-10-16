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
    assert.match(workflow,/playwright install-deps chromium/u,`${name}: Chromium deps missing`);
    assert.match(workflow,/playwright install chromium/u,`${name}: Chromium miss install missing`);
    assert.match(workflow,/chromium\.executablePath\(\)/u,`${name}: Chromium readiness check missing`);
    assert.match(workflow,/-chromium/u,`${name}: Chromium cache namespace missing`);
  }
});

test('Admin browser shards preserve Chromium WebKit and Firefox independently',()=>{
  const workflow=workflows.admin;
  for(const browser of ['chromium','webkit','firefox']){
    assert.match(workflow,new RegExp(`browser: ${browser}`,'u'),`admin: ${browser} matrix entry missing`);
  }
  assert.match(workflow,/playwright install-deps "\$\{\{ matrix\.browser \}\}"/u,'admin: per-browser system deps missing');
  assert.match(workflow,/playwright install "\$\{\{ matrix\.browser \}\}"/u,'admin: per-browser cache-miss install missing');
  assert.match(workflow,/PW_BROWSER: \$\{\{ matrix\.browser \}\}/u,'admin: per-browser readiness check missing');
  assert.match(workflow,/hashFiles\('package-lock\.json'\).*matrix\.browser/u,'admin: per-browser cache namespace missing');
  assert.match(workflow,/restore-keys:[\s\S]*?-all/u,'admin: warm restore from all-browser cache missing');
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
