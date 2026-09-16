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

  assert.ok(remote.includes('group: iberfit-qa-authenticated-gates-${{ github.event_name }}-${{ github.ref }}'));
  assert.match(remote,/concurrency:\n  group: iberfit-qa-authenticated-gates-[^\n]+\n  cancel-in-progress: true/u);

  assert.doesNotMatch(daily,/^  group: iberfit-daily-use-visual-evidence$/mu);
  assert.doesNotMatch(admin,/^  group: iberfit-admin-interaction-matrix$/mu);
  assert.doesNotMatch(remote,/^  group: iberfit-qa-authenticated-gates$/mu);

  assert.ok(device.includes('group: iberfit-device-experience-${{ github.event.pull_request.number || github.ref }}'));
  assert.match(device,/concurrency:\n  group: iberfit-device-experience-[^\n]+\n  cancel-in-progress: true/u);
});

test('manual remote certification cannot cancel push certification merely by sharing the same ref',()=>{
  assert.ok(remote.includes('${{ github.event_name }}-${{ github.ref }}'));
});

test('shared authenticated QA remains globally serialized and non-cancellable inside the heavy workflows',()=>{
  for(const [name,workflow] of [['daily',daily],['remote',remote],['device',device]]){
    assert.match(workflow,/group: iberfit-qa-shared-auth-readonly/u,`${name}: shared QA lock missing`);
    assert.match(workflow,/group: iberfit-qa-shared-auth-readonly[\s\S]*?queue: max[\s\S]*?cancel-in-progress: false/u,`${name}: shared QA serialization weakened`);
  }
});

test('concurrency optimization does not remove browser cache or deterministic dependency contracts',()=>{
  for(const [name,workflow] of [['daily',daily],['admin',admin],['remote',remote]]){
    assert.match(workflow,/npm ci/u,`${name}: npm ci missing`);
    assert.match(workflow,/actions\/cache@v4/u,`${name}: Playwright cache missing`);
    assert.match(workflow,/playwright install-deps/u,`${name}: Playwright system deps missing`);
  }
});
