import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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


test('RC39 cambios de sesión activan el gate especializado y conservan los gates existentes',()=>{
  const expected=['validate','targeted-preflight','audit-read-only','device-experience-gate-phase-a',
    'offline','browser-live-workout','qa-readonly'];
  for(const file of [
    'src/m26/rc39/route-render.js',
    'src/m26/rc39/session-policy.js',
  ]){
    assert.deepEqual(names([file]),expected,file);
  }
  assert.deepEqual(names(['tests/canary_session_preview_role_experience.test.mjs']),
    ['validate','targeted-preflight','audit-read-only','offline','browser-live-workout','qa-readonly']);
  assert.deepEqual(names(['.github/workflows/session-qa-isolated.yml']),
    ['validate','targeted-preflight','offline','browser-live-workout','qa-readonly']);
});

test('los disparadores Session QA cubren las rutas exigidas y mantienen el mutex de QA',()=>{
  const source=fs.readFileSync('.github/workflows/session-qa-isolated.yml','utf8');
  for(const path of [
    'src/m26/rc39/route-render.js',
    'src/m26/rc39/session-policy.js',
    'tests/canary_session_preview_role_experience.test.mjs',
  ]){
    assert.ok(source.includes("- '"+path+"'"),'missing Session QA trigger: '+path);
  }
  assert.match(source,/group: iberfit-qa-shared-auth-readonly\s+queue: max\s+cancel-in-progress: false/u);
  assert.match(source,/environment: m26-canary-readonly/u);
});

test('la certificacion RC39 no queda verde con Session QA ausente, incompleta o roja',()=>{
  const required=names(['src/m26/rc39/route-render.js']);
  const base=required.filter(name=>!['offline','browser-live-workout','qa-readonly'].includes(name))
    .map((name,index)=>({id:index+1,name,status:'completed',conclusion:'success'}));
  const absent=evaluateRequiredChecks(required,base);
  assert.equal(absent.state,'pending');
  assert.deepEqual([...absent.pending],['offline','browser-live-workout','qa-readonly']);
  const two=[{id:20,name:'offline',status:'completed',conclusion:'success'},
    {id:21,name:'browser-live-workout',status:'completed',conclusion:'success'}];
  const missing=evaluateRequiredChecks(required,[...base,...two]);
  assert.equal(missing.state,'pending');
  assert.deepEqual([...missing.pending],['qa-readonly']);
  const failed=evaluateRequiredChecks(required,[...base,...two,
    {id:22,name:'qa-readonly',status:'completed',conclusion:'failure'}]);
  assert.equal(failed.state,'failure');
  const green=evaluateRequiredChecks(required,[...base,...two,
    {id:23,name:'qa-readonly',status:'completed',conclusion:'success'}]);
  assert.equal(green.state,'success');
});

test('UNIVERSAL: all session controller and Live Workout entrypoints require the 3 specialized gates',()=>{
  for(const path of [
    'src/m26/workflows/session-controller.js',
    'src/m26/workflows/session-ui.js',
    'src/m26/workflows/session-timer.js',
    'src/m26/command-bus.js',
    'src/m26/ui/i18n-surface-session.js',
    'src/m26/design/role-surfaces.css',
    'src/m26/design/premium-ux.css',
    'qa/live-workout/live-workout-browser.spec.mjs',
    'playwright.live-workout.config.mjs',
    'tests/m26_session_foreground_refresh.test.mjs',
    'tests/m26_live_workout_accessibility.test.mjs',
    'tests/m26_example_draft_recovery.test.mjs',
    'scripts/run_node_tests_offline.mjs',
    'scripts/offline_network_guard.mjs',
    'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
    'package.json',
  ]){
    const required=names([path]);
    for(const gate of ['offline','browser-live-workout','qa-readonly'])
      assert.ok(required.includes(gate),path+': '+gate);
  }
  const notSession=[
    'src/m26/workflows/report-workflow.js',
    'src/m26/workflows/session-other/nested.js',
    'qa/p0-free-history/live-client-a-cases.mjs',
    'tests/m26_progress_engine.test.mjs',
  ];
  for(const path of notSession){
    const required=names([path]);
    assert.ok(!required.includes('browser-live-workout'),path);
    assert.ok(!required.includes('qa-readonly'),path);
  }
});

test('UNIVERSAL: a failing or missing session browser gate cannot certify a session controller edit',()=>{
  const required=names(['src/m26/workflows/session-controller.js']);
  const successful=required.filter(name=>name!=='browser-live-workout')
    .map((name,i)=>({id:i+1,name,status:'completed',conclusion:'success'}));
  const missing=evaluateRequiredChecks(required,successful);
  assert.equal(missing.state,'pending');
  assert.deepEqual([...missing.pending],['browser-live-workout']);
  const failed=evaluateRequiredChecks(required,[...successful,
    {id:100,name:'browser-live-workout',status:'completed',conclusion:'failure'}]);
  assert.equal(failed.state,'failure');
  const good=evaluateRequiredChecks(required,[...successful,
    {id:101,name:'browser-live-workout',status:'completed',conclusion:'success'}]);
  assert.equal(good.state,'success');
});
