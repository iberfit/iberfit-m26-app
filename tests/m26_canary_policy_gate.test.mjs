import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRequiredChecks,
  requiredChecksForFiles,
} from '../scripts/ci/canary_policy_gate.mjs';

function names(files){
  return [...requiredChecksForFiles(files)];
}

test('cambios de UI exigen toda la cadena de calidad aplicable',()=>{
  assert.deepEqual(
    names(['src/m26/ui/progress-continuity.js']),
    [
      'validate',
      'targeted-preflight',
      'audit-read-only',
      'device-experience-gate-phase-a',
      'authenticated-client-controls',
    ],
  );
});

test('cambios documentales irrelevantes no quedan bloqueados por gates que no se ejecutan',()=>{
  assert.deepEqual(
    names(['docs/architecture/notes.md']),
    ['validate'],
  );
});

test('tests generales exigen Fast Lane y auditoría sin inventar Device Gate',()=>{
  assert.deepEqual(
    names(['tests/example.test.mjs']),
    ['validate','targeted-preflight','audit-read-only'],
  );
});

test('cambios de dispositivo exigen el agregador Device Experience',()=>{
  assert.deepEqual(
    names(['playwright.device-experience.config.mjs']),
    ['validate','device-experience-gate-phase-a'],
  );
});

test('el policy gate espera checks ausentes o todavía ejecutándose',()=>{
  const result=evaluateRequiredChecks(
    ['validate','targeted-preflight'],
    [{id:1,name:'validate',status:'completed',conclusion:'success'}],
  );
  assert.equal(result.state,'pending');
  assert.deepEqual([...result.pending],['targeted-preflight']);
});

test('el policy gate bloquea inmediatamente un check requerido rojo',()=>{
  const result=evaluateRequiredChecks(
    ['validate','audit-read-only'],
    [
      {id:1,name:'validate',status:'completed',conclusion:'success'},
      {id:2,name:'audit-read-only',status:'completed',conclusion:'failure'},
    ],
  );
  assert.equal(result.state,'failure');
  assert.deepEqual([...result.failed],[{name:'audit-read-only',conclusion:'failure'}]);
});

test('el policy gate solo queda verde cuando todos los checks requeridos están verdes',()=>{
  const result=evaluateRequiredChecks(
    ['validate','targeted-preflight','audit-read-only'],
    [
      {id:1,name:'validate',status:'completed',conclusion:'success'},
      {id:2,name:'targeted-preflight',status:'completed',conclusion:'success'},
      {id:3,name:'audit-read-only',status:'completed',conclusion:'success'},
    ],
  );
  assert.equal(result.state,'success');
  assert.deepEqual([...result.passed],[
    'validate',
    'targeted-preflight',
    'audit-read-only',
  ]);
});

test('un rerun posterior prevalece sobre un intento antiguo rojo del mismo check',()=>{
  const result=evaluateRequiredChecks(
    ['validate'],
    [
      {id:10,name:'validate',status:'completed',conclusion:'failure'},
      {id:11,name:'validate',status:'completed',conclusion:'success'},
    ],
  );
  assert.equal(result.state,'success');
});

test('M43 Draft skipped result never becomes green and waits for Ready job to register',()=>{
  const required=['validate','device-experience-gate-phase-a'];
  const stale=[
    {id:10,name:'validate',status:'completed',conclusion:'success'},
    {id:11,name:'device-experience-gate-phase-a',status:'completed',conclusion:'skipped'},
  ];
  const waiting=evaluateRequiredChecks(required,stale);
  assert.equal(waiting.state,'pending');
  assert.deepEqual([...waiting.pending],['device-experience-gate-phase-a']);
  assert.deepEqual([...waiting.passed],['validate']);
  const started=evaluateRequiredChecks(required,[...stale,
    {id:12,name:'device-experience-gate-phase-a',status:'in_progress',conclusion:null},
  ]);
  assert.equal(started.state,'pending');
  const certified=evaluateRequiredChecks(required,[...stale,
    {id:13,name:'device-experience-gate-phase-a',status:'completed',conclusion:'success'},
  ]);
  assert.equal(certified.state,'success');
});

test('M43 stale cancelled/neutral checks wait for a new Ready attempt but cannot certify integration',()=>{
  for(const conclusion of ['skipped','cancelled','neutral']){
    const result=evaluateRequiredChecks(['authenticated-client-controls'],[
      {id:12,name:'authenticated-client-controls',status:'completed',conclusion},
    ]);
    assert.equal(result.state,'pending',conclusion);
    assert.deepEqual([...result.passed],[]);
    assert.deepEqual([...result.pending],['authenticated-client-controls']);
  }
  for(const conclusion of ['failure','timed_out','action_required']){
    const result=evaluateRequiredChecks(['validate'],[
      {id:15,name:'validate',status:'completed',conclusion},
    ]);
    assert.equal(result.state,'failure',conclusion);
  }
});
