import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Source SHA certification requires these workflows on every Canary push.
// Keep their PR path filters to avoid redundant QA on unrelated PRs.
for(const filename of ['coach-webauthn-recurring.yml','admin-webauthn-recurring.yml','remote-gates.yml']){
  test(filename+' certifies every Canary source SHA',()=>{
    const yaml=readFileSync(new URL('../.github/workflows/'+filename,import.meta.url),'utf8');
    const push=yaml.match(/^  push:\n([\s\S]*?)(?=^  workflow_dispatch:)/m)?.[1];
    assert.ok(push,'Canary push section missing');
    assert.match(push,/^    branches:/m);
    assert.match(push,/canary\/rc74-4/);
    assert.doesNotMatch(push,/^    paths(?:-ignore)?:/m,'A filtered push can skip mandatory exact-SHA release gates');
    assert.match(yaml,/^  workflow_dispatch:/m);
  });
}
