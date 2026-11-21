import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(
  new URL('../scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',import.meta.url),
  'utf8',
);

test('P0 Free: canonical M43 bootstrap calls run serially under QA 8s statement timeout',()=>{
  assert.match(source,/let a=await bootstrap\(clientA\);\s*let b=await bootstrap\(clientB\);/u);
  assert.match(source,/const clientReady=await ownerProjection\(clientA,'session',draft\.id,idA\);\s*const otherVisibility=await foreignVisibility\(clientB,'session',draft\.id\);/u);
  assert.match(source,/const finalA=await bootstrap\(clientA\);\s*const finalForeign=await foreignVisibility\(clientB,'session_execution',execution\.id\);/u);
  assert.match(source,/const uiReady=await ownerProjection\(clientA,'session',uiDraft\.id,idA\);\s*const uiForeign=await foreignVisibility\(clientB,'session',uiDraft\.id\);/u);
  assert.match(source,/const runningReady=await ownerProjection\(clientA,'session',runningDraft\.id,idA\);\s*const runningForeign=await foreignVisibility\(clientB,'session',runningDraft\.id\);/u);
  assert.equal((source.match(/Promise\.all/gu)||[]).length,1,
    'only independent password sign-ins may run concurrently');
  assert.match(source,/let \[coach,clientA,clientB\]=await Promise\.all\(/u);
});

test('P0 Free: serialization retains Client B denial, owner readback and executed-history checks',()=>{
  assert.match(source,/!otherVisibility\.canonicalVisible&&!otherVisibility\.legacyVisible/u);
  assert.match(source,/!finalForeign\.canonicalVisible&&!finalForeign\.legacyVisible/u);
  assert.match(source,/!uiForeign\.canonicalVisible&&!uiForeign\.legacyVisible/u);
  assert.match(source,/!runningForeign\.canonicalVisible&&!runningForeign\.legacyVisible/u);
  assert.match(source,/contains\(finalA,execution\.id,'session_execution'\)/u);
  assert.match(source,/evidence\.phase='complete';\s*evidence\.passed=true;/u);
  assert.match(source,/assessM43SyntheticFixtureBudget\(a\)/u);
});
