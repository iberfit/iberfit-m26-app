import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflowUrl=new URL('../.github/workflows/canary-exact-deploy.yml',import.meta.url);

const readWorkflow=()=>readFile(workflowUrl,'utf8');

test('Canary Exact keeps deploy serialization while isolating QA auth preflight on the shared fixture lock',async()=>{
  const workflow=await readWorkflow();

  assert.match(workflow,/concurrency:\s*\n\s*group: iberfit-m26-canary-exact-deploy\s*\n\s*cancel-in-progress: false/u);
  assert.match(workflow,/qa-auth-readonly-preflight:[\s\S]*?concurrency:\s*\n\s*group: iberfit-qa-shared-auth-readonly\s*\n\s*cancel-in-progress: false/u);
  assert.match(workflow,/qa-auth-readonly-preflight:[\s\S]*?node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
  assert.match(workflow,/deploy-canary:[\s\S]*?needs: qa-auth-readonly-preflight/u);

  const calls=workflow.match(/node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/gu)??[];
  assert.equal(calls.length,1,'authenticated QA gate must run exactly once under the shared fixture lock');

  const deploy=workflow.slice(workflow.indexOf('  deploy-canary:'));
  assert.doesNotMatch(deploy,/M26_QA_COACH_PASSWORD/u);
  assert.doesNotMatch(deploy,/run_authenticated_readonly_gate\.mjs/u);
});

test('QA auth preflight remains fail-closed, evidence-producing and free of service-role credentials',async()=>{
  const workflow=await readWorkflow();
  const start=workflow.indexOf('  qa-auth-readonly-preflight:');
  const end=workflow.indexOf('  deploy-canary:');
  assert.ok(start>=0&&end>start,'QA auth preflight must be a dedicated job before deploy');
  const preflight=workflow.slice(start,end);

  assert.match(preflight,/environment: m26-canary-readonly/u);
  assert.match(preflight,/M26_QA_ONLY: 'true'/u);
  assert.match(preflight,/M26_QA_COACH_EMAIL/u);
  assert.match(preflight,/M26_QA_CLIENT_A_EMAIL/u);
  assert.match(preflight,/M26_QA_CLIENT_B_EMAIL/u);
  assert.match(preflight,/if: always\(\)[\s\S]*actions\/upload-artifact@v4/u);
  assert.match(preflight,/recovery\/RC29_REMOTE_\*\.json/u);
  assert.match(preflight,/recovery\/RC74_4_REMOTE_\*\.json/u);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY/u);
});
