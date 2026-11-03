import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const RULES=[
  ['.github/workflows/coach-webauthn-recurring.yml',2],
  ['.github/workflows/admin-webauthn-recurring.yml',2],
  ['.github/workflows/remote-gates.yml',1],
];
for(const [path,count] of RULES){
  test('IRI private photo mutations must trigger same-SHA auth/remote gates: '+path,()=>{
    const workflow=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(workflow,/^  workflow_dispatch:/mu);
    for(const selector of [
      "src/m26/workflows/iri-photogrammetry-*.js",
      "src/m26/workflows/iri-photogrammetry.css",
    ]){
      const exact="      - '"+selector+"'";
      assert.equal(workflow.split(exact).length-1,count,
        path+' must trigger for both PR and Canary push (remote: Canary push)');
    }
  });
}
