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

test('Admin and remote gates preserve Chromium WebKit and Firefox',()=>{
  for(const name of ['admin','remote']){
    const workflow=workflows[name];
    assert.match(workflow,/install-deps chromium webkit firefox/u,`${name}: cross-browser deps missing`);
    assert.match(workflow,/install chromium webkit firefox/u,`${name}: cross-browser miss install missing`);
    assert.match(workflow,/chromium, firefox, webkit/u,`${name}: browser readiness matrix missing`);
    assert.match(workflow,/-all/u,`${name}: all-browser cache namespace missing`);
  }
});

test('Playwright cache optimization never caches node_modules',()=>{
  for(const [name,workflow] of Object.entries(workflows)){
    assert.doesNotMatch(workflow,/path:\s*(?:\.\/)?node_modules/u,`${name}: node_modules must not be cached`);
  }
});
