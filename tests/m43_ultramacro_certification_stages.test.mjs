import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=(name)=>readFileSync(new URL('../.github/workflows/'+name+'.yml',import.meta.url),'utf8');
const heavy={
  'qa-real-write-cert':['connected360-v45-synthetic-write','qa-real-write','m43-real-coach-client-qa','m43-real-client-browser'],
  'device-experience-gate':['contract','workflow-matrix','client-coach-qa','admin-task-matrix','pwa-upgrade','gate'],
  'admin-interaction-matrix':['browser-matrix'],
  'daily-use-visual-evidence':['capture'],
  'authenticated-client-interaction':['authenticated-client-controls'],
};
const stages='types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]';

test('M43 ultramacro: heavyweight jobs run on Ready or trusted push, not Draft',()=>{
  for(const [name,jobs] of Object.entries(heavy)){
    const contents=workflow(name);
    assert.ok(contents.includes(stages),name+' must run on Ready and every subsequent candidate SHA');
    for(const job of jobs){
      const marker='  '+job+':\n';
      assert.equal(contents.split(marker).length,2,name+' expected job '+job+' exactly once');
      const firstLines=contents.split(marker)[1].split('\n').slice(0,6).join('\n');
      assert.match(firstLines,/if:/,name+':'+job+' missing job guard');
      assert.ok(firstLines.includes("github.event_name != 'pull_request'"),name+':'+job+' trusted push must run');
      assert.ok(firstLines.includes("!github.event.pull_request.draft"),name+':'+job+' Draft must skip');
    }
  }
});

test('M43 ultramacro: required canary-policy-gate must fail closed on Draft',()=>{
  const policy=workflow('canary-policy-gate');
  assert.ok(policy.includes(stages));
  assert.ok(policy.includes('DRAFT_NOT_CERTIFIED'));
  assert.ok(policy.includes('exit 42'));
  const start=policy.indexOf('      - name: Verificar política de integración Canary');
  assert.ok(start>0);
  assert.ok(policy.slice(start,start+240).includes('!github.event.pull_request.draft'));
  assert.ok(policy.includes('node scripts/ci/canary_policy_gate.mjs'));
  assert.ok(workflow('ci').includes(stages));
  assert.ok(workflow('ci').includes('  validate:\n'));
  assert.ok(workflow('fast-lane').includes(stages));
});

test('M43 ultramacro: QA write concurrency never interrupts an actual mutation',()=>{
  const qa=workflow('qa-real-write-cert');
  assert.ok(qa.includes('group: iberfit-qa-real-write-cert'));
  assert.ok(qa.includes('cancel-in-progress: false'));
  assert.ok(qa.includes('queue: max'));
  assert.ok(qa.includes('m43-real-client-browser:\n    if:'));
});

test('M43 ultramacro: conditional tests do not replace existing live-safety responsibilities',()=>{
  const qa=workflow('qa-real-write-cert');
  const device=workflow('device-experience-gate');
  assert.ok(qa.includes('    needs: [m43-real-coach-client-qa]'));
  assert.ok(device.includes('needs: [contract,workflow-matrix,client-coach-qa,admin-task-matrix,pwa-upgrade]'));
  assert.ok(workflow('ci').includes('    timeout-minutes: 35'));
});
