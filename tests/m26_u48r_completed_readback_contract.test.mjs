import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/coach-webauthn-recurring.yml','utf8');
const runner=readFileSync('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs','utf8');
const proof=readFileSync('qa/coach-webauthn-recurring/u48-completed-readback.mjs','utf8');

test('U48R is gated only on exact first Canary push and can never reenable original U48 writes',()=>{
  const line=workflow.split('\n').find(v=>v.includes('M26_QA_U48_COMPLETED_READBACK:'));
  assert.ok(line);
  for(const expected of ["github.event_name == 'push'","github.ref == 'refs/heads/canary/rc74-4'",
    "github.run_attempt == 1","startsWith(github.event.head_commit.message, 'SIGNATURE U48R:')"])
    assert.ok(line.includes(expected),expected);
  const old=workflow.split('\n').find(v=>v.includes('M26_QA_U48_RUNNING:'));
  assert.ok(old.includes("'SIGNATURE U48:'"));
  assert.ok(!old.includes("U48R:"),'Readback push cannot re-run original exercise');
});

test('U48R has zero mutation helpers and checks client+coach independent authenticated readback',()=>{
  assert.match(runner,/certifyU48CompletedReadback\(/u);
  assert.match(runner,/M26_QA_U48_COMPLETED_READBACK==='true'/u);
  assert.match(proof,/U48R_READONLY_TRUSTED_CANARY_ONLY/u);
  assert.match(proof,/await page\.reload\(/u);
  assert.match(proof,/await coachPage\.reload\(/u);
  assert.match(proof,/data-coach-client-workspace/u);
  assert.match(proof,/clientHistoryConfirmed=true/u);
  assert.match(proof,/coachMfaReadbackConfirmed=true/u);
  assert.match(proof,/FEEDBACK/u);
  assert.doesNotMatch(proof,/newU47Scope|iberfit_execute_command_v26|EJECUCION_COMPLETAR|SESION_INICIAR|SESION_PUBLICAR|\.execute\(/u);
  assert.match(runner,/M26_QA_U48_COMPLETED_READBACK','M26_QA_U48_RUNNING','M26_QA_U48_READBACK|M26_QA_U48_RUNNING','M26_QA_U48_READBACK','M26_QA_U48_COMPLETED_READBACK/u);
});

test('readback locks exact U47 completed client, legacy projection, and prevents restart',()=>{
 for(const key of ['57f56a87-d04e-47d5-b1cc-8d4939d7c804',
 '4d244c01-8966-40f1-8cc7-9e6ec46d1708',
 '16145839-2e7d-48e2-bf0c-e94325f5c54c',
 "toBe('completada')","toBe(4)","data-m43-completed-session",
 'data-workflow-action="start-published-session"'])
   assert.ok(proof.includes(key),key);
});
