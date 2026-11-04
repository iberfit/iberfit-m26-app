import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const paths=[
  '.github/workflows/coach-webauthn-recurring.yml',
  '.github/workflows/admin-webauthn-recurring.yml',
];
for(const path of paths){
  test('RC64 visual assurance requires exact-SHA WebAuthn PR and Canary push: '+path,()=>{
    const content=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    const line="      - 'qa/rc64/authenticated-visual-evidence.spec.mjs'";
    assert.equal(content.split(line).length-1,2);
    assert.match(content,/^  workflow_dispatch:/mu);
  });
}
test('RC64 visuals trigger Remote gate without broad paths or duplicate QA Auth',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/remote-gates.yml',import.meta.url),'utf8');
  assert.match(workflow,/      - 'qa\/rc64\/\*\*'/u);
  assert.doesNotMatch(workflow,/      - 'src\/\*\*'/u);
  assert.match(workflow,/group: iberfit-qa-shared-auth-readonly/u);
});
