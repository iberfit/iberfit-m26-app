import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const daily=read('.github/workflows/daily-use-visual-evidence.yml');
const admin=read('.github/workflows/admin-interaction-matrix.yml');
const remote=read('.github/workflows/remote-gates.yml');
const device=read('.github/workflows/device-experience-gate.yml');

test('heavy PR/ref workflows cancel superseded executions instead of consuming stale runners',()=>{
  assert.ok(daily.includes('group: iberfit-daily-use-visual-evidence-${{ github.event.pull_request.number || github.ref }}'));
  assert.match(daily,/concurrency:\n  group: iberfit-daily-use-visual-evidence-[^\n]+\n  cancel-in-progress: true/u);

  assert.ok(admin.includes('group: iberfit-admin-interaction-matrix-${{ github.event.pull_request.number || github.ref }}'));
  assert.match(admin,/concurrency:\n  group: iberfit-admin-interaction-matrix-[^\n]+\n  cancel-in-progress: true/u);

  assert.match(remote,/concurrency:\n  group: iberfit-qa-authenticated-gates\n  cancel-in-progress: false/u);

  assert.doesNotMatch(daily,/^  group: iberfit-daily-use-visual-evidence$/mu);
  assert.doesNotMatch(admin,/^  group: iberfit-admin-interaction-matrix$/mu);

  assert.ok(device.includes('group: iberfit-device-experience-${{ github.event.pull_request.number || github.ref }}'));
  assert.match(device,/concurrency:\n  group: iberfit-device-experience-[^\n]+\n  cancel-in-progress: true/u);
});

test('remote auth gates retain the global non-cancelling queue shared with Hosted Auth hardening',()=>{
  assert.match(remote,/group: iberfit-qa-authenticated-gates/u);
  assert.match(remote,/cancel-in-progress: false/u);
});

test('shared authenticated QA remains globally serialized and non-cancellable inside the heavy workflows',()=>{
  for(const [name,workflow] of [['daily',daily],['remote',remote],['device',device]]){
    assert.match(workflow,/group: iberfit-qa-shared-auth-readonly/u,`${name}: shared QA lock missing`);
    assert.match(workflow,/group: iberfit-qa-shared-auth-readonly[\s\S]*?queue: max[\s\S]*?cancel-in-progress: false/u,`${name}: shared QA serialization weakened`);
  }
});

test('concurrency optimization retains deterministic cached or SHA-pinned browser supply',()=>{
  for(const [name,workflow] of [['daily',daily],['admin',admin],['remote',remote]]){
    assert.match(workflow,/npm ci/u,`${name}: npm ci missing`);
    if(name==='remote'||name==='admin'){
      // Both use the same immutable, browser-complete supply chain instead
      // of apt mirror downloads; verify the replacement rather than require
      // the old cache mechanism that the pinned image makes redundant.
      assert.match(workflow,/mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:[0-9a-f]{64}/u,`${name}: SHA-pinned Playwright image required`);
      assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/u,`${name}: browser path required`);
      if(name==='remote'){
        assert.match(workflow,/QA_BROWSER_MISSING/u,'remote: browser availability must fail closed');
        assert.match(workflow,/needs: prepare-ui/u,'remote: auth must depend on completed non-auth prep');
      }else{
        assert.match(workflow,/PW_BROWSER: \$\{\{ matrix\.browser \}\}/u,'admin: each engine remains verified');
        assert.match(workflow,/runuser -u pwuser -- npx playwright test/u,'admin: non-root Firefox remains certified');
        assert.doesNotMatch(workflow,/playwright install-deps/u,'admin: apt mirror must not block CI');
      }
    }else{
      assert.match(workflow,/actions\/cache@v4/u,`${name}: Playwright cache missing`);
      assert.match(workflow,/playwright install-deps/u,`${name}: Playwright system deps missing`);
    }
  }
});
